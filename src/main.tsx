import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type PreviewMode = "pdf" | "text" | "markdown";
type CompileState = "idle" | "compiling" | "success" | "error";
type CompileIssue = {
  line: number | null;
  message: string;
};
type CopyState = "idle" | "copied" | "error";

const starterLatex = String.raw`\documentclass{article}
\title{A Tiny LaTeX Preview}
\author{Server-side Tectonic compile}
\date{\today}

\begin{document}
\maketitle

\section{Hello}
Paste or import a .tex file on the left. The PDF preview updates after LaTeX compilation.

Inline math works too: \( e^{i\pi} + 1 = 0 \).

\[
  \int_0^1 x^2\,dx = \frac{1}{3}
\]

\section{Notes}
This app compiles with Tectonic on a Vercel serverless function, so packages and custom macros work much more like a real LaTeX editor.
\end{document}`;

function App() {
  const [sourceLatex, setSourceLatex] = useState(starterLatex);
  const [plainText, setPlainText] = useState(() => extractCleanText(starterLatex));
  const [markdownText, setMarkdownText] = useState(() => extractCleanMarkdown(starterLatex));
  const [pdfUrl, setPdfUrl] = useState("");
  const [compileState, setCompileState] = useState<CompileState>("idle");
  const [compileError, setCompileError] = useState("");
  const [isErrorToastDismissed, setIsErrorToastDismissed] = useState(false);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("pdf");
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [zoom, setZoom] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pdfUrlRef = useRef("");
  const compileRunRef = useRef(0);
  const compileAbortRef = useRef<AbortController | null>(null);

  const compileSource = useCallback(async (source: string) => {
    const runId = compileRunRef.current + 1;
    compileAbortRef.current?.abort();
    const controller = new AbortController();
    compileRunRef.current = runId;
    compileAbortRef.current = controller;
    setCompileState("compiling");
    setCompileError("");
    setIsErrorToastDismissed(false);

    try {
      const response = await fetch("/api/compile", {
        body: JSON.stringify({ source }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });

      if (runId !== compileRunRef.current) {
        return;
      }

      if (!response.ok) {
        const detail = await readCompileError(response);
        throw new Error(detail);
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
      pdfUrlRef.current = nextUrl;
      setPdfUrl(nextUrl);
      setCompileState("success");
    } catch (error) {
      if (runId !== compileRunRef.current) {
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setCompileState("error");
      setCompileError(error instanceof Error ? error.message : "LaTeX compilation failed.");
      setIsErrorToastDismissed(false);
    } finally {
      if (runId === compileRunRef.current && compileAbortRef.current === controller) {
        compileAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    setPlainText(extractCleanText(sourceLatex));
    setMarkdownText(extractCleanMarkdown(sourceLatex));
    const timer = window.setTimeout(() => {
      void compileSource(sourceLatex);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [compileSource, sourceLatex]);

  useEffect(() => {
    return () => {
      compileAbortRef.current?.abort();
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
    };
  }, []);

  const zoomLabel = useMemo(() => `${Math.round(zoom * 100)}%`, [zoom]);
  const compileIssue = useMemo(() => parseCompileIssue(compileError), [compileError]);
  const lineNumbers = useMemo(() => createLineNumbers(sourceLatex), [sourceLatex]);
  const shouldShowSourceIssue = compileState === "error" && Boolean(compileError);
  const shouldShowErrorToast = shouldShowSourceIssue && !isErrorToastDismissed;
  const copyPayload = previewMode === "markdown" ? markdownText : previewMode === "text" ? plainText : "";
  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "error"
        ? "Copy failed"
        : previewMode === "markdown"
          ? "Copy Markdown"
          : previewMode === "text"
            ? "Copy Text"
            : "Copy";

  function updateZoom(nextZoom: number) {
    setZoom(Math.min(2, Math.max(0.55, Number(nextZoom.toFixed(2)))));
  }

  async function copyPreview() {
    if (!copyPayload) {
      return;
    }

    try {
      await copyTextToClipboard(copyPayload);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
      window.setTimeout(() => setCopyState("idle"), 1800);
    }
  }

  function focusIssueLine() {
    if (!compileIssue.line || !textareaRef.current) {
      textareaRef.current?.focus();
      return;
    }

    const range = getLineRange(sourceLatex, compileIssue.line);
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(range.start, range.end);
  }

  function syncLineNumberScroll() {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }

  function readFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".tex")) {
      setCompileState("error");
      setCompileError("Please import a .tex file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setSourceLatex(String(reader.result ?? ""));
    reader.onerror = () => {
      setCompileState("error");
      setCompileError("Could not read that file.");
    };
    reader.readAsText(file);
  }

  function handleDrop(event: React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    const [file] = Array.from(event.dataTransfer.files);
    if (file) {
      readFile(file);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <h1>LaTeX Viewer</h1>
        </div>

        <div className="topbar-actions">
          <button className="button-primary" type="button" onClick={() => void compileSource(sourceLatex)}>
            Compile
          </button>

          <div className="segmented-control" role="tablist" aria-label="Preview mode">
            <button
              type="button"
              className={previewMode === "pdf" ? "is-active" : ""}
              onClick={() => {
                setPreviewMode("pdf");
                setCopyState("idle");
              }}
              aria-selected={previewMode === "pdf"}
              role="tab"
            >
              PDF
            </button>
            <button
              type="button"
              className={previewMode === "text" ? "is-active" : ""}
              onClick={() => {
                setPreviewMode("text");
                setCopyState("idle");
              }}
              aria-selected={previewMode === "text"}
              role="tab"
            >
              Text
            </button>
            <button
              type="button"
              className={previewMode === "markdown" ? "is-active" : ""}
              onClick={() => {
                setPreviewMode("markdown");
                setCopyState("idle");
              }}
              aria-selected={previewMode === "markdown"}
              role="tab"
            >
              Markdown
            </button>
          </div>

          <button
            type="button"
            onClick={() => void copyPreview()}
            disabled={!copyPayload}
            aria-live="polite"
            title={copyPayload ? "Copy the current preview text" : "Switch to Text or Markdown to copy"}
          >
            {copyLabel}
          </button>

          <div className="zoom-controls" aria-label="Zoom controls">
            <button type="button" onClick={() => updateZoom(zoom - 0.1)} aria-label="Zoom out">
              -
            </button>
            <button type="button" onClick={() => updateZoom(1)} aria-label="Reset zoom">
              {zoomLabel}
            </button>
            <button type="button" onClick={() => updateZoom(zoom + 0.1)} aria-label="Zoom in">
              +
            </button>
          </div>

          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".tex,text/x-tex,text/plain"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                readFile(file);
              }
              event.currentTarget.value = "";
            }}
          />
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Import .tex
          </button>
          <button type="button" onClick={() => setSourceLatex(starterLatex)}>
            Reset
          </button>
        </div>
      </header>
      {compileState === "compiling" ? <div className="progress-rail" aria-label="Compiling PDF" /> : null}

      <section
        className={`workspace ${isDragging ? "is-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <section className={`pane editor-pane ${shouldShowSourceIssue ? "has-issue" : ""}`} aria-label="LaTeX editor">
          <div className="pane-header">
            <div>
              <h2>Source</h2>
              <span>{sourceLatex.length.toLocaleString()} chars</span>
            </div>
            {shouldShowSourceIssue ? (
              <button className="source-issue-pill" type="button" onClick={focusIssueLine}>
                {compileIssue.line ? `Line ${compileIssue.line}` : "Syntax issue"}
              </button>
            ) : null}
          </div>
          {shouldShowSourceIssue ? (
            <button className="source-issue-banner" type="button" onClick={focusIssueLine}>
              <span>{compileIssue.line ? `Line ${compileIssue.line}` : "Compiler error"}</span>
              {compileIssue.message}
            </button>
          ) : null}
          <div className="editor-surface">
            <div className="line-numbers" ref={lineNumbersRef} aria-hidden="true">
              {lineNumbers.map((lineNumber) => (
                <span
                  className={compileIssue.line === lineNumber && shouldShowSourceIssue ? "is-error-line" : ""}
                  key={lineNumber}
                >
                  {lineNumber}
                </span>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              spellCheck={false}
              value={sourceLatex}
              onChange={(event) => setSourceLatex(event.target.value)}
              onScroll={syncLineNumberScroll}
              aria-label="LaTeX source editor"
            />
          </div>
        </section>

        <section className="pane preview-pane" aria-label="Preview">
          <div className="preview-scroll">
            {previewMode === "pdf" ? (
              <PdfPreview state={compileState} pdfUrl={pdfUrl} zoom={zoom} />
            ) : previewMode === "markdown" ? (
              <pre className="text-preview markdown-preview" style={{ fontSize: `${zoom}rem` }}>
                {markdownText}
              </pre>
            ) : (
              <pre className="text-preview" style={{ fontSize: `${zoom}rem` }}>
                {plainText}
              </pre>
            )}
          </div>
        </section>
      </section>

      {shouldShowErrorToast ? (
        <div className="toast" role="alert">
          <div>
            <strong>Compile failed</strong>
            <p>{compileIssue.message}</p>
          </div>
          <button type="button" onClick={() => setIsErrorToastDismissed(true)} aria-label="Dismiss error">
            Close
          </button>
        </div>
      ) : null}
    </main>
  );
}

function PdfPreview({
  pdfUrl,
  state,
  zoom,
}: {
  pdfUrl: string;
  state: CompileState;
  zoom: number;
}) {
  if (state === "compiling" && !pdfUrl) {
    return (
      <div className="loading-panel" role="status">
        Compiling PDF...
      </div>
    );
  }

  if (state === "error" && !pdfUrl) {
    return (
      <div className="loading-panel" role="status">
        No PDF preview yet.
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="loading-panel" role="status">
        Waiting for first compile...
      </div>
    );
  }

  return (
    <div className="pdf-stage">
        <div
          className="pdf-scale"
          style={{
            height: `${100 / zoom}%`,
            transform: `scale(${zoom})`,
            width: `${100 / zoom}%`,
          }}
        >
          <iframe className="pdf-frame" src={`${pdfUrl}#toolbar=1&navpanes=0`} title="Compiled LaTeX PDF" />
        </div>
    </div>
  );
}

async function readCompileError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: string; log?: string };
    return [body.error, body.log].filter(Boolean).join("\n\n") || "LaTeX compilation failed.";
  }

  return (await response.text()) || "LaTeX compilation failed.";
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed.");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function extractCleanText(source: string) {
  return normalizeTextLatex(extractDocumentBody(stripComments(source)))
    .replace(/\\documentclass(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\begin\{document}/g, "")
    .replace(/\\end\{document}/g, "")
    .replace(/\\maketitle/g, "")
    .replace(/\\title\{([^}]*)}/g, "$1\n")
    .replace(/\\author\{([^}]*)}/g, "$1\n")
    .replace(/\\date\{\\today}/g, new Date().toLocaleDateString(undefined, { dateStyle: "long" }))
    .replace(/\\date\{([^}]*)}/g, "$1\n")
    .replace(/\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]*)}/g, "\n\n$2\n")
    .replace(/\\\[((?:.|\n)*?)\\\]/g, "\n$1\n")
    .replace(/\\\(((?:.|\n)*?)\\\)/g, "$1")
    .replace(/\$\$((?:.|\n)*?)\$\$/g, "\n$1\n")
    .replace(/\$([^$\n]*)\$/g, "$1")
    .replace(/\\frac\{([^}]*)}\{([^}]*)}/g, "$1/$2")
    .replace(/\\(pi|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega)\b/g, "$1")
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractCleanMarkdown(source: string) {
  return normalizeMarkdownLatex(extractDocumentBody(stripComments(source)))
    .replace(/\\documentclass(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\begin\{document}/g, "")
    .replace(/\\end\{document}/g, "")
    .replace(/\\maketitle/g, "")
    .replace(/\\title\{([^}]*)}/g, "# $1\n")
    .replace(/\\author\{([^}]*)}/g, "_$1_\n")
    .replace(/\\date\{\\today}/g, new Date().toLocaleDateString(undefined, { dateStyle: "long" }))
    .replace(/\\date\{([^}]*)}/g, "$1\n")
    .replace(/\\part\*?\{([^}]*)}/g, "\n# $1\n")
    .replace(/\\chapter\*?\{([^}]*)}/g, "\n# $1\n")
    .replace(/\\section\*?\{([^}]*)}/g, "\n## $1\n")
    .replace(/\\subsection\*?\{([^}]*)}/g, "\n### $1\n")
    .replace(/\\subsubsection\*?\{([^}]*)}/g, "\n#### $1\n")
    .replace(/\\\[((?:.|\n)*?)\\\]/g, "\n\n$$\n$1\n$$\n")
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_match, math: string) => `$${math}$`)
    .replace(/\$\$((?:.|\n)*?)\$\$/g, "\n\n$$\n$1\n$$\n")
    .replace(/\\begin\{equation\*?}((?:.|\n)*?)\\end\{equation\*?}/g, "\n\n$$\n$1\n$$\n")
    .replace(/\\begin\{align\*?}((?:.|\n)*?)\\end\{align\*?}/g, "\n\n$$\n$1\n$$\n")
    .replace(/\\[a-zA-Z]+(?:\[[^\]]*])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseCompileIssue(error: string): CompileIssue {
  const log = error.trim();
  const texLine = log.match(/(?:^|\n)(?:error:\s*)?[^:\n]+\.tex:(\d+):\s*([^\n]+)/i);
  const latexLine = log.match(/(?:^|\n)l\.(\d+)\s*([^\n]*)/i);
  const line = Number(texLine?.[1] ?? latexLine?.[1] ?? "") || null;
  const message = texLine?.[2] ?? latexLine?.[2] ?? firstUsefulErrorLine(log);

  return {
    line,
    message: cleanErrorMessage(message),
  };
}

function createLineNumbers(source: string) {
  return Array.from({ length: source.split("\n").length }, (_, index) => index + 1);
}

function firstUsefulErrorLine(log: string) {
  return (
    log
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !line.toLowerCase().startsWith("latex compilation failed")) ?? "Check the compiler log."
  );
}

function cleanErrorMessage(message: string) {
  return message.replace(/^error:\s*/i, "").trim() || "Check the compiler log.";
}

function getLineRange(source: string, line: number) {
  const lines = source.split("\n");
  const targetLine = Math.min(Math.max(line, 1), lines.length);
  let start = 0;

  for (let index = 0; index < targetLine - 1; index += 1) {
    start += lines[index].length + 1;
  }

  return {
    end: start + lines[targetLine - 1].length,
    start,
  };
}

function stripComments(source: string) {
  return source.replace(/(^|[^\\])%.*$/gm, "$1");
}

function extractDocumentBody(source: string) {
  const match = source.match(/\\begin\{document}([\s\S]*?)\\end\{document}/);
  return match?.[1] ?? source;
}

function normalizeTextLatex(source: string) {
  let result = source;
  result = replaceLatexCommand(result, "href", 2, ([, label]) => label);
  result = replaceLatexCommand(result, "underline", 1, ([label]) => label);
  result = replaceLatexCommand(result, "textbf", 1, ([label]) => label);
  result = replaceLatexCommand(result, "textit", 1, ([label]) => label);
  result = replaceLatexCommand(result, "emph", 1, ([label]) => label);

  return result
    .replace(/\\fa[A-Za-z]+\b/g, "")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/\\quad/g, " ")
    .replace(/\\hfill/g, " ")
    .replace(/\\\s+/g, " ")
    .replace(/\\vspace\*?\{[^}]*}/g, "")
    .replace(/\\begin\{center}/g, "")
    .replace(/\\end\{center}/g, "")
    .replace(/\\begin\{itemize}(?:\[[^\]]*])?/g, "\n")
    .replace(/\\end\{itemize}/g, "\n")
    .replace(/\\item\b/g, "\n- ")
    .replace(/\\\\/g, "\n");
}

function normalizeMarkdownLatex(source: string) {
  let result = source;
  result = replaceLatexCommand(result, "href", 2, ([url, label]) => `[${label}](${url})`);
  result = replaceLatexCommand(result, "textbf", 1, ([label]) => `**${label}**`);
  result = replaceLatexCommand(result, "textit", 1, ([label]) => `*${label}*`);
  result = replaceLatexCommand(result, "emph", 1, ([label]) => `*${label}*`);
  result = replaceLatexCommand(result, "underline", 1, ([label]) => label);

  return result
    .replace(/\\fa[A-Za-z]+\b/g, "")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/\\quad/g, " ")
    .replace(/\\hfill/g, " ")
    .replace(/\\vspace\*?\{[^}]*}/g, "")
    .replace(/\\begin\{center}/g, "")
    .replace(/\\end\{center}/g, "")
    .replace(/\\begin\{itemize}(?:\[[^\]]*])?/g, "\n")
    .replace(/\\begin\{enumerate}(?:\[[^\]]*])?/g, "\n")
    .replace(/\\end\{itemize}/g, "\n")
    .replace(/\\end\{enumerate}/g, "\n")
    .replace(/\\item\b/g, "\n- ")
    .replace(/\\\\/g, "\n");
}

function replaceLatexCommand(
  source: string,
  command: string,
  argCount: number,
  format: (args: string[]) => string,
) {
  let output = "";
  let index = 0;
  const token = `\\${command}`;

  while (index < source.length) {
    const commandIndex = source.indexOf(token, index);
    if (commandIndex === -1) {
      output += source.slice(index);
      break;
    }

    output += source.slice(index, commandIndex);
    let cursor = commandIndex + token.length;
    const args: string[] = [];

    for (let i = 0; i < argCount; i += 1) {
      cursor = skipWhitespace(source, cursor);
      const parsed = readBracedArgument(source, cursor);
      if (!parsed) {
        args.length = 0;
        break;
      }
      args.push(parsed.value);
      cursor = parsed.end;
    }

    if (args.length === argCount) {
      output += format(args);
      index = cursor;
    } else {
      output += token;
      index = commandIndex + token.length;
    }
  }

  return output;
}

function skipWhitespace(source: string, index: number) {
  let cursor = index;
  while (/\s/.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function readBracedArgument(source: string, index: number) {
  if (source[index] !== "{") {
    return null;
  }

  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    const previous = source[cursor - 1];

    if (char === "{" && previous !== "\\") {
      depth += 1;
    }
    if (char === "}" && previous !== "\\") {
      depth -= 1;
      if (depth === 0) {
        return {
          end: cursor + 1,
          value: source.slice(index + 1, cursor),
        };
      }
    }
  }

  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
