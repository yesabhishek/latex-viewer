import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "LaTeX Viewer: LaTeX source on the left, the compiled PDF on the right.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const fontDir = join(process.cwd(), "node_modules/geist/dist/fonts");
const sansRegular = readFile(join(fontDir, "geist-sans/Geist-Regular.ttf"));
const sansSemiBold = readFile(join(fontDir, "geist-sans/Geist-SemiBold.ttf"));
const mono = readFile(join(fontDir, "geist-mono/GeistMono-Regular.ttf"));

const sourceLines: Array<Array<[string, string]>> = [
  [["\\documentclass", "#8ea4ff"], ["{article}", "#a1a1aa"]],
  [["\\title", "#8ea4ff"], ["{Field Notes}", "#a1a1aa"]],
  [],
  [["\\begin", "#8ea4ff"], ["{document}", "#5fd4b4"]],
  [["\\section", "#8ea4ff"], ["{Results}", "#a1a1aa"]],
  [["The integral settles at", "#e4e4e7"]],
  [["\\[", "#f2b36b"], [" \\int_0^1 x^2\\,dx = ", "#f2b36b"], ["\\frac", "#8ea4ff"], ["{1}{3} ", "#f2b36b"], ["\\]", "#f2b36b"]],
  [["\\end", "#8ea4ff"], ["{document}", "#5fd4b4"]],
];

export default async function OpenGraphImage() {
  const [regular, semibold, monoData] = await Promise.all([sansRegular, sansSemiBold, mono]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#0c0c0d",
          color: "#fafafa",
          padding: "64px 72px",
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <svg width="52" height="52" viewBox="0 0 24 24">
            <rect width="24" height="24" rx="6.5" fill="#fafafa" />
            <path d="M5.75 6.5h9.5v2.6h-3.45v8.4H9.2V9.1H5.75z" fill="#0c0c0d" />
            <rect x="14.1" y="12.1" width="4.15" height="5.4" rx="0.7" fill="#4f6cf5" />
          </svg>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>
            LaTeX<span style={{ color: "#8b8b93", fontWeight: 400, marginLeft: 10 }}>Viewer</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 44 }}>
          <div style={{ fontSize: 60, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05 }}>Write LaTeX.</div>
          <div style={{ fontSize: 60, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, color: "#8b8b93" }}>
            See the PDF as you type.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            height: 236,
            borderRadius: 16,
            border: "1px solid #26262a",
            background: "#121214",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 640,
              padding: "22px 26px",
              fontFamily: "Geist Mono",
              fontSize: 17,
              lineHeight: 1.55,
              borderRight: "1px solid #26262a",
            }}
          >
            {sourceLines.map((tokens, index) => (
              <div key={index} style={{ display: "flex", height: 26 }}>
                <span style={{ width: 34, color: "#4a4a52" }}>{index + 1}</span>
                {tokens.map(([text, color], tokenIndex) => (
                  <span key={tokenIndex} style={{ color, whiteSpace: "pre" }}>
                    {text}
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flex: 1, justifyContent: "center", paddingTop: 26, background: "#0a0a0b" }}>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                width: 300,
                height: 260,
                background: "#ffffff",
                borderRadius: 4,
                padding: "26px 30px",
                color: "#111113",
              }}
            >
              <div style={{ display: "flex", justifyContent: "center", fontSize: 20, fontWeight: 600 }}>Field Notes</div>
              <div style={{ display: "flex", fontSize: 14, fontWeight: 600, marginTop: 22 }}>1  Results</div>
              {[100, 92, 70].map((width, index) => (
                <div
                  key={index}
                  style={{ display: "flex", height: 7, width: `${width}%`, background: "#e4e4e7", borderRadius: 4, marginTop: 10 }}
                />
              ))}
              <div style={{ display: "flex", justifyContent: "center", fontSize: 15, marginTop: 16, color: "#3f3f46" }}>
                ∫ x² dx = 1/3
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Geist", data: regular, weight: 400, style: "normal" },
        { name: "Geist", data: semibold, weight: 600, style: "normal" },
        { name: "Geist Mono", data: monoData, weight: 400, style: "normal" },
      ],
    },
  );
}
