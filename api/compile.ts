import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { platformResolver } = require("node-latex-compiler") as {
  platformResolver: {
    resolveTectonicExecutable: (options?: { tectonicPath?: string }) => string | null;
  };
};

const MAX_SOURCE_BYTES = 512 * 1024;
const COMPILE_TIMEOUT_MS = 55_000;

export const config = {
  maxDuration: 60,
};

type CompileBody = {
  source?: unknown;
};

type CompileResult =
  | {
      ok: true;
      pdf: Buffer;
    }
  | {
      ok: false;
      error: string;
      log?: string;
      status: number;
    };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST with a JSON body containing { source }." });
  }

  const source = readSource(req.body as CompileBody | string | undefined);
  const result = await compileLatexSource(source);

  if (result.ok === false) {
    return res.status(result.status).json({ error: result.error, log: result.log });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(result.pdf);
}

export async function compileLatexSource(source: string): Promise<CompileResult> {
  if (!source.trim()) {
    return { error: "No LaTeX source was provided.", ok: false, status: 400 };
  }

  const compilerSource = normalizeSourceForCompiler(source);

  if (Buffer.byteLength(compilerSource, "utf8") > MAX_SOURCE_BYTES) {
    return { error: "LaTeX source is too large for this lightweight compiler.", ok: false, status: 413 };
  }

  const tectonicPath = platformResolver.resolveTectonicExecutable({});
  if (!tectonicPath) {
    return { error: "Tectonic compiler binary is not available.", ok: false, status: 500 };
  }

  const jobDir = await mkdtemp(path.join(tmpdir(), "latex-viewer-"));
  const texPath = path.join(jobDir, `document-${randomUUID()}.tex`);
  const pdfPath = texPath.replace(/\.tex$/, ".pdf");

  try {
    await writeFile(texPath, compilerSource, "utf8");
    const result = await runTectonic(tectonicPath, texPath, jobDir);

    if (result.code !== 0) {
      return {
        error: "LaTeX compilation failed.",
        log: compactLog(result.stderr || result.stdout || result.error || ""),
        ok: false,
        status: 422,
      };
    }

    const pdf = await readFile(pdfPath);
    return { ok: true, pdf };
  } catch (error) {
    return {
      error: "Unable to compile LaTeX.",
      log: error instanceof Error ? error.message : String(error),
      ok: false,
      status: 500,
    };
  } finally {
    await rm(jobDir, { force: true, recursive: true });
  }
}

function readSource(body: CompileBody | string | undefined) {
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body) as CompileBody;
      return typeof parsed.source === "string" ? parsed.source : "";
    } catch {
      return body;
    }
  }

  return typeof body?.source === "string" ? body.source : "";
}

function runTectonic(tectonicPath: string, texPath: string, outDir: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; error?: string }>((resolve) => {
    const child = execFile(
      tectonicPath,
      [texPath, "--outdir", outDir, "--untrusted", "--keep-logs", "--reruns", "1"],
      {
        cwd: outDir,
        env: {
          ...process.env,
          HOME: tmpdir(),
          XDG_CACHE_HOME: path.join(tmpdir(), "tectonic-cache"),
        },
        timeout: COMPILE_TIMEOUT_MS,
      },
      (error, stdout, stderr) => {
        resolve({
          code: typeof error?.code === "number" ? error.code : error ? 1 : 0,
          error: error?.message,
          stdout,
          stderr,
        });
      },
    );

    child.stdin?.end();
  });
}

function normalizeSourceForCompiler(source: string) {
  return replaceFontAwesomeIconCommands(source)
    .replace(/\\usepackage(?:\[[^\]]*])?\{fontawesome5}/g, fontAwesomeCompatibilityShim)
    .replace(/\\usepackage(?:\[[^\]]*])?\{helvet}/g, sansFontCompatibilityShim)
    .replace(/^\s*\\input\{glyphtounicode}\s*$/gm, "")
    .replace(/^\s*\\pdfgentounicode\s*=\s*1\s*$/gm, "");
}

function fontAwesomeCompatibilityShim() {
  return String.raw`\usepackage{fontawesome}
\providecommand{\faIcon}[1]{\ensuremath{\bullet}}
\providecommand{\faPhoneAlt}{\faPhone}
\providecommand{\faMobileAlt}{\faMobile}
\providecommand{\faEnvelopeOpen}{\faEnvelope}
\providecommand{\faGlobeAmericas}{\faGlobe}
\providecommand{\faGlobeEurope}{\faGlobe}
\providecommand{\faGlobeAsia}{\faGlobe}
\providecommand{\faMapMarkerAlt}{\faMapMarker}
\providecommand{\faLinkedinIn}{\faLinkedin}
\providecommand{\faGithubAlt}{\faGithub}
\providecommand{\faExternalLinkAlt}{\faExternalLink}
\providecommand{\faBriefcase}{\faSuitcase}
\providecommand{\faUniversity}{\faInstitution}
\providecommand{\faGraduationCap}{\faMortarBoard}
\providecommand{\faCertificate}{\faCheckCircle}
\providecommand{\faTools}{\faWrench}
\providecommand{\faCodeBranch}{\faCodeFork}
\providecommand{\faDatabase}{\faHddO}
\providecommand{\faAws}{\textsf{\scriptsize AWS}}
\providecommand{\faSnowflake}{\ensuremath{\ast}}`;
}

function sansFontCompatibilityShim() {
  return String.raw`\usepackage{tgheros}`;
}

function replaceFontAwesomeIconCommands(source: string) {
  const iconAliases: Record<string, string> = {
    "address-card": "\\faAddressCard",
    aws: "\\faAws",
    briefcase: "\\faBriefcase",
    calendar: "\\faCalendar",
    certificate: "\\faCertificate",
    "code-branch": "\\faCodeBranch",
    database: "\\faDatabase",
    envelope: "\\faEnvelope",
    "envelope-open": "\\faEnvelopeOpen",
    "external-link-alt": "\\faExternalLinkAlt",
    github: "\\faGithub",
    globe: "\\faGlobe",
    "globe-americas": "\\faGlobeAmericas",
    "graduation-cap": "\\faGraduationCap",
    linkedin: "\\faLinkedin",
    "linkedin-in": "\\faLinkedinIn",
    "map-marker-alt": "\\faMapMarkerAlt",
    mobile: "\\faMobile",
    "mobile-alt": "\\faMobileAlt",
    phone: "\\faPhone",
    "phone-alt": "\\faPhoneAlt",
    snowflake: "\\faSnowflake",
    tools: "\\faTools",
    university: "\\faUniversity",
  };

  return source.replace(/\\faIcon\{([^}]+)}/g, (match, iconName: string) => {
    return iconAliases[iconName.trim().toLowerCase()] ?? match;
  });
}

function compactLog(log: string) {
  return log
    .split("\n")
    .slice(-80)
    .join("\n")
    .trim();
}
