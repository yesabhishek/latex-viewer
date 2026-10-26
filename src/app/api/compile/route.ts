import { compileLatex } from "@/lib/server/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Slightly above the 512 KB compiler limit so JSON escaping overhead does not reject valid sources.
const MAX_BODY_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const body = await readBody(request);
  if (body === null) {
    return Response.json(
      { error: "Request body is larger than the 1 MB limit." },
      { status: 413, headers: { "Cache-Control": "no-store" } },
    );
  }
  const source = readSource(body, request.headers.get("content-type") ?? "");
  const startedAt = performance.now();
  const result = await compileLatex(source);
  const duration = Math.round(performance.now() - startedAt);

  if (!result.ok) {
    return Response.json(
      { error: result.error, log: result.log },
      { status: result.status, headers: { "Cache-Control": "no-store", "Server-Timing": `compile;dur=${duration}` } },
    );
  }

  return new Response(new Uint8Array(result.pdf), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/pdf",
      "Server-Timing": `compile;dur=${duration}`,
      "X-Compile-Cache": result.cached ? "hit" : "miss",
    },
  });
}

// Reads the body incrementally so an oversized upload is cut off instead of buffered in memory.
async function readBody(request: Request) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return null;
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return "";
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readSource(body: string, contentType: string) {
  if (!contentType.includes("application/json")) {
    return body;
  }

  try {
    const parsed = JSON.parse(body) as { source?: unknown };
    return typeof parsed.source === "string" ? parsed.source : "";
  } catch {
    return "";
  }
}
