import { compileLatex } from "@/lib/server/tectonic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const source = await readSource(request);
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

async function readSource(request: Request) {
  const body = await request.text();
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    return body;
  }

  try {
    const parsed = JSON.parse(body) as { source?: unknown };
    return typeof parsed.source === "string" ? parsed.source : "";
  } catch {
    return "";
  }
}
