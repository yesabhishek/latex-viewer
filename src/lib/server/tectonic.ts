import "server-only";

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { normalizeSourceForCompiler } from "./shims";

const MAX_SOURCE_BYTES = 512 * 1024;
const COMPILE_TIMEOUT_MS = 55_000;
const CACHE_MAX_ENTRIES = 24;
const CACHE_MAX_BYTES = 48 * 1024 * 1024;

export type CompileResult =
  | { ok: true; pdf: Buffer; cached: boolean }
  | { ok: false; status: number; error: string; log?: string };

// Warm instances keep recent PDFs so repeated or reverted sources return instantly.
const pdfCache = new Map<string, Buffer>();
let pdfCacheBytes = 0;
const inflight = new Map<string, Promise<CompileResult>>();

// Tectonic downloads its package bundle on first use. Until one compile has finished, run them
// one at a time so concurrent cold starts do not race on the shared cache.
let cacheWarm = false;
let warmupQueue: Promise<unknown> = Promise.resolve();

// Serverless file systems are read-only outside /tmp, so the cache lives there.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const compilerEnv = isServerless
  ? { ...process.env, HOME: tmpdir(), XDG_CACHE_HOME: path.join(tmpdir(), "tectonic-cache") }
  : process.env;

export async function compileLatex(source: string): Promise<CompileResult> {
  if (!source.trim()) {
    return { ok: false, status: 400, error: "No LaTeX source was provided." };
  }

  const compilerSource = normalizeSourceForCompiler(source);

  if (Buffer.byteLength(compilerSource, "utf8") > MAX_SOURCE_BYTES) {
    return { ok: false, status: 413, error: "LaTeX source is larger than the 512 KB limit." };
  }

  const key = createHash("sha256").update(compilerSource).digest("hex");
  const cached = pdfCache.get(key);
  if (cached) {
    pdfCache.delete(key);
    pdfCache.set(key, cached);
    return { ok: true, pdf: cached, cached: true };
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending;
  }

  const job = runSerializedUntilWarm(compilerSource).then((result) => {
    if (result.ok) {
      remember(key, result.pdf);
    }
    return result;
  });

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

async function runSerializedUntilWarm(compilerSource: string) {
  if (cacheWarm) {
    return runCompile(compilerSource);
  }

  const run = warmupQueue.then(() => runCompile(compilerSource));
  warmupQueue = run.catch(() => undefined);
  const result = await run;
  if (result.ok || result.status === 422) {
    cacheWarm = true;
  }
  return result;
}

async function runCompile(compilerSource: string): Promise<CompileResult> {
  const tectonicPath = resolveTectonicPath();
  if (!tectonicPath) {
    return { ok: false, status: 500, error: "Tectonic compiler binary is not available." };
  }

  const jobDir = await mkdtemp(path.join(tmpdir(), "latex-viewer-"));
  const texPath = path.join(jobDir, "document.tex");
  const pdfPath = path.join(jobDir, "document.pdf");

  try {
    await writeFile(texPath, compilerSource, "utf8");
    const result = await runTectonic(tectonicPath, texPath, jobDir);

    if (result.timedOut) {
      return {
        ok: false,
        status: 504,
        error: "Compilation took longer than 55 seconds and was stopped.",
        log: compactLog(result.stderr || result.stdout || ""),
      };
    }

    if (result.code !== 0) {
      return {
        ok: false,
        status: 422,
        error: "LaTeX compilation failed.",
        log: compactLog(result.stderr || result.stdout || result.error || ""),
      };
    }

    return { ok: true, pdf: await readFile(pdfPath), cached: false };
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: "Unable to compile LaTeX.",
      log: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(jobDir, { force: true, recursive: true });
  }
}

function runTectonic(tectonicPath: string, texPath: string, outDir: string) {
  return new Promise<{ code: number; timedOut: boolean; stdout: string; stderr: string; error?: string }>((resolve) => {
    const child = execFile(
      tectonicPath,
      [texPath, "--outdir", outDir, "--untrusted", "--reruns", "1", "--chatter", "minimal"],
      {
        cwd: outDir,
        env: compilerEnv,
        maxBuffer: 4 * 1024 * 1024,
        timeout: COMPILE_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          timedOut: Boolean(error?.killed),
          error: error?.message,
          stdout,
          stderr,
        });
      },
    );

    child.stdin?.end();
  });
}

let resolvedTectonicPath: string | null | undefined;

function resolveTectonicPath() {
  if (resolvedTectonicPath !== undefined) {
    return resolvedTectonicPath;
  }

  // vendor/bin holds the static Linux build installed for Vercel, so it only applies on Linux.
  const candidates = [
    process.env.TECTONIC_PATH,
    ...(process.platform === "linux"
      ? [path.join(process.cwd(), "vendor", "bin", "tectonic"), "/var/task/vendor/bin/tectonic"]
      : []),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(/*turbopackIgnore: true*/ candidate)) {
      resolvedTectonicPath = candidate;
      return candidate;
    }
  }

  // Local development falls back to the platform binary shipped by node-latex-compiler, then PATH.
  try {
    const require = createRequire(import.meta.url);
    const { platformResolver } = require("node-latex-compiler") as {
      platformResolver: { resolveTectonicExecutable: (options?: { tectonicPath?: string }) => string | null };
    };
    resolvedTectonicPath = platformResolver.resolveTectonicExecutable({});
  } catch {
    resolvedTectonicPath = null;
  }

  return resolvedTectonicPath;
}

function remember(key: string, pdf: Buffer) {
  if (pdf.byteLength > CACHE_MAX_BYTES / 4) {
    return;
  }

  pdfCache.set(key, pdf);
  pdfCacheBytes += pdf.byteLength;

  while (pdfCache.size > CACHE_MAX_ENTRIES || pdfCacheBytes > CACHE_MAX_BYTES) {
    const oldest = pdfCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    pdfCacheBytes -= pdfCache.get(oldest)?.byteLength ?? 0;
    pdfCache.delete(oldest);
  }
}

function compactLog(log: string) {
  return log.split("\n").slice(-80).join("\n").trim();
}
