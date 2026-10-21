export const starterLatex = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath}

\title{A Tiny LaTeX Preview}
\author{LaTeX Viewer}
\date{\today}

\begin{document}
\maketitle

\section{Hello}
Write on the left. The PDF on the right rebuilds a moment after you stop typing.
Press \textbf{Cmd+S} to compile right away, or \textbf{Cmd+K} for every command.

Inline math works: \( e^{i\pi} + 1 = 0 \).

\[
  \int_0^1 x^2 \, dx = \frac{1}{3}
\]

\section{Notes}
Documents compile with Tectonic on the server, so packages and custom macros
behave the way they do in a desktop TeX setup.

\begin{itemize}
  \item Drop a \texttt{.tex} file anywhere to open it.
  \item Switch to Text or Markdown to copy clean output.
\end{itemize}
\end{document}
`;

export type CompileIssue = {
  line: number | null;
  message: string;
};

export function parseCompileIssue(log: string): CompileIssue {
  const text = log.trim();
  const texLine = text.match(/(?:^|\n)(?:error:\s*)?[^:\n]+\.tex:(\d+):\s*([^\n]+)/i);
  const latexLine = text.match(/(?:^|\n)l\.(\d+)\s*([^\n]*)/i);
  const line = Number(texLine?.[1] ?? latexLine?.[1] ?? "") || null;
  const message = texLine?.[2] ?? latexLine?.[2] ?? firstUsefulLine(text);

  return { line, message: message.replace(/^error:\s*/i, "").trim() || "Check the compiler log." };
}

function firstUsefulLine(log: string) {
  return (
    log
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line && !/^latex compilation failed/i.test(line)) ?? "Check the compiler log."
  );
}

export function countWords(source: string) {
  const body = extractDocumentBody(stripComments(source))
    .replace(/\\[a-zA-Z@]+\*?/g, " ")
    .replace(/[{}[\]$\\&%#_^~]/g, " ");
  const matches = body.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu);
  return matches?.length ?? 0;
}

export function extractCleanText(source: string) {
  return normalizeText(extractDocumentBody(stripComments(source)))
    .replace(/\\documentclass(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\maketitle/g, readTitleBlock(source, "text"))
    .replace(/\\(part|chapter|section|subsection|subsubsection)\*?\{([^}]*)}/g, "\n\n$2\n")
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_match, math: string) => `\n${math.trim()}\n`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_match, math: string) => math.trim())
    .replace(/\$\$((?:.|\n)*?)\$\$/g, (_match, math: string) => `\n${math.trim()}\n`)
    .replace(/\$([^$\n]*)\$/g, (_match, math: string) => math.trim())
    .replace(/\\frac\{([^}]*)}\{([^}]*)}/g, "$1/$2")
    .replace(/\\([a-zA-Z]+)(?![a-zA-Z])/g, (match, name: string) => mathSymbols[name] ?? match)
    .replace(/\\[,;:!]/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .replace(/(?<=^- [^\n]*)\n{2,}(?=- )/gm, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const mathSymbols: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  int: "∫",
  oint: "∮",
  sum: "∑",
  prod: "∏",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sqrt: "√",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  equiv: "≡",
  sim: "∼",
  propto: "∝",
  in: "∈",
  notin: "∉",
  subset: "⊂",
  subseteq: "⊆",
  cup: "∪",
  cap: "∩",
  forall: "∀",
  exists: "∃",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  Leftarrow: "⇐",
  leftrightarrow: "↔",
  Leftrightarrow: "⇔",
  mapsto: "↦",
  ldots: "...",
  dots: "...",
  cdots: "...",
  degree: "°",
};

export function extractCleanMarkdown(source: string) {
  // Math is lifted out first so the command and brace cleanup below never touches it.
  const math: string[] = [];
  const hold = (value: string) => `\uE000${math.push(value) - 1}\uE001`;
  const display = (value: string) => hold(`\n\n$$\n${value.trim()}\n$$\n\n`);

  const body = extractDocumentBody(stripComments(source))
    .replace(/\\begin\{(align|gather|multline)(\*?)}([\s\S]*?)\\end\{\1\2}/g, (_match, env: string, _star, value: string) =>
      display(env === "align" ? `\\begin{aligned}${value}\\end{aligned}` : value),
    )
    .replace(/\\begin\{(equation|displaymath)(\*?)}([\s\S]*?)\\end\{\1\2}/g, (_match, _env, _star, value: string) =>
      display(value),
    )
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, value: string) => display(value))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, value: string) => display(value))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_match, value: string) => hold(`$${value.trim()}$`))
    .replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (_match, value: string) => hold(`$${value.trim()}$`));

  return normalizeMarkdown(body)
    .replace(/\\documentclass(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\usepackage(?:\[[^\]]*])?\{[^}]*}/g, "")
    .replace(/\\maketitle/g, readTitleBlock(source, "markdown"))
    .replace(/\\part\*?\{([^}]*)}/g, "\n# $1\n")
    .replace(/\\chapter\*?\{([^}]*)}/g, "\n# $1\n")
    .replace(/\\section\*?\{([^}]*)}/g, "\n## $1\n")
    .replace(/\\subsection\*?\{([^}]*)}/g, "\n### $1\n")
    .replace(/\\subsubsection\*?\{([^}]*)}/g, "\n#### $1\n")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*])?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/^- {2,}/gm, "- ")
    .replace(/(?<=^- [^\n]*)\n{2,}(?=- )/gm, "\n")
    .replace(/\uE000(\d+)\uE001/g, (_match, index: string) => math[Number(index)])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// \title, \author and \date usually live in the preamble, so render them where \maketitle sits.
function readTitleBlock(source: string, format: "text" | "markdown") {
  const preamble = stripComments(source);
  const title = readCommandArgument(preamble, "title");
  const author = readCommandArgument(preamble, "author");
  const rawDate = readCommandArgument(preamble, "date");
  const date =
    rawDate === null || rawDate.trim() === "\\today"
      ? rawDate === null
        ? null
        : new Date().toLocaleDateString(undefined, { dateStyle: "long" })
      : rawDate;

  const lines =
    format === "markdown"
      ? [title && `# ${title}`, author && `_${author}_`, date]
      : [title, author, date];

  return `\n${lines.filter(Boolean).join("\n\n").replace(/\$/g, "$$$$")}\n`;
}

function readCommandArgument(source: string, command: string) {
  const index = source.search(new RegExp(`\\\\${command}\\s*\\{`));
  if (index === -1) {
    return null;
  }
  const open = source.indexOf("{", index);
  return readBracedArgument(source, open)?.value.replace(/\\\\/g, " ").trim() ?? null;
}

function stripComments(source: string) {
  return source.replace(/(^|[^\\])%.*$/gm, "$1");
}

function extractDocumentBody(source: string) {
  const match = source.match(/\\begin\{document}([\s\S]*?)\\end\{document}/);
  return match?.[1] ?? source;
}

function normalizeCommon(source: string) {
  return source
    .replace(/\\fa[A-Za-z]+\b/g, "")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\#/g, "#")
    .replace(/\\(?:quad|qquad|hfill)\b/g, " ")
    .replace(/\\[vh]space\*?\{[^}]*}/g, "")
    .replace(/\\begin\{(?:center|flushleft|flushright)}|\\end\{(?:center|flushleft|flushright)}/g, "")
    .replace(/\\begin\{(?:itemize|enumerate|description)}(?:\[[^\]]*])?/g, "\n")
    .replace(/\\end\{(?:itemize|enumerate|description)}/g, "\n")
    .replace(/\\item\b(?:\[[^\]]*])?/g, "\n- ")
    .replace(/\\\\(?:\[[^\]]*])?/g, "\n")
    .replace(/~/g, " ");
}

function dropTitleCommands(source: string) {
  let result = source;
  for (const command of ["title", "author", "date", "thanks"]) {
    result = replaceCommand(result, command, 1, () => "");
  }
  return result;
}

function normalizeText(source: string) {
  let result = dropTitleCommands(source);
  result = replaceCommand(result, "href", 2, ([, label]) => label);
  for (const command of ["underline", "textbf", "textit", "emph", "texttt", "textsc"]) {
    result = replaceCommand(result, command, 1, ([label]) => label);
  }
  return normalizeCommon(result).replace(/\\\s+/g, " ");
}

function normalizeMarkdown(source: string) {
  let result = dropTitleCommands(source);
  result = replaceCommand(result, "href", 2, ([url, label]) => `[${label}](${url})`);
  result = replaceCommand(result, "url", 1, ([url]) => `<${url}>`);
  result = replaceCommand(result, "textbf", 1, ([label]) => `**${label}**`);
  result = replaceCommand(result, "textit", 1, ([label]) => `*${label}*`);
  result = replaceCommand(result, "emph", 1, ([label]) => `*${label}*`);
  result = replaceCommand(result, "texttt", 1, ([label]) => `\`${label}\``);
  result = replaceCommand(result, "underline", 1, ([label]) => label);
  result = replaceCommand(result, "textsc", 1, ([label]) => label);
  return normalizeCommon(result);
}

function replaceCommand(source: string, command: string, argCount: number, format: (args: string[]) => string) {
  const token = `\\${command}`;
  let output = "";
  let index = 0;

  while (index < source.length) {
    const commandIndex = source.indexOf(token, index);
    if (commandIndex === -1) {
      output += source.slice(index);
      break;
    }

    output += source.slice(index, commandIndex);
    let cursor = commandIndex + token.length;

    // Avoid matching a longer command name, for example \url inside \urlstyle.
    if (/[a-zA-Z]/.test(source[cursor] ?? "")) {
      output += token;
      index = cursor;
      continue;
    }

    const args: string[] = [];
    for (let i = 0; i < argCount; i += 1) {
      while (/\s/.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      const parsed = readBracedArgument(source, cursor);
      if (!parsed) {
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

function readBracedArgument(source: string, index: number) {
  if (source[index] !== "{") {
    return null;
  }

  let depth = 0;
  for (let cursor = index; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (source[cursor - 1] === "\\") {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return { end: cursor + 1, value: source.slice(index + 1, cursor) };
      }
    }
  }

  return null;
}
