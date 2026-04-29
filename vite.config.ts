import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { compileLatexSource } from "./api/compile";

export default defineConfig({
  plugins: [localCompileApi(), react()],
  build: {
    chunkSizeWarningLimit: 700,
  },
});

function localCompileApi() {
  return {
    name: "local-latex-compile-api",
    configureServer(server) {
      server.middlewares.use("/api/compile", async (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.setHeader("Allow", "POST");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Use POST with a JSON body containing { source }." }));
          return;
        }

        try {
          const rawBody = await readRequestBody(req);
          const source = readSourceFromBody(rawBody);
          const result = await compileLatexSource(source);

          if (!result.ok) {
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: result.error, log: result.log }));
            return;
          }

          res.statusCode = 200;
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("Content-Type", "application/pdf");
          res.end(result.pdf);
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error: "Unable to compile LaTeX.",
              log: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    },
  };
}

function readRequestBody(req: NodeJS.ReadableStream) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readSourceFromBody(body: string) {
  try {
    const parsed = JSON.parse(body) as { source?: unknown };
    return typeof parsed.source === "string" ? parsed.source : "";
  } catch {
    return body;
  }
}
