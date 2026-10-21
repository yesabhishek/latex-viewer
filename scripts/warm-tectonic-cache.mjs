// Compiles a few representative documents at build time so the Tectonic package bundle
// files and the LaTeX format file are already cached when the compile function cold starts.
// The cache lives in node_modules/.cache, which Vercel restores between builds, so only the
// first build pays for the downloads. A failure here only costs speed, so it never fails the build.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const tectonicPath = process.env.TECTONIC_PATH ?? path.join(rootDir, "vendor", "bin", "tectonic");
const cacheDir = path.join(rootDir, "node_modules", ".cache", "tectonic");

const documents = {
  article: String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb,amsthm,mathtools}
\usepackage[margin=1in]{geometry}
\usepackage{graphicx}
\usepackage{xcolor}
\usepackage{booktabs,tabularx,multirow,array,longtable}
\usepackage{caption,subcaption,float}
\usepackage{enumitem}
\usepackage{listings}
\usepackage{setspace}
\usepackage{tikz}
\usepackage{hyperref}
\newtheorem{theorem}{Theorem}
\title{Warm Up}
\author{LaTeX Viewer}
\date{\today}
\begin{document}
\maketitle
\tableofcontents
\section{Text}
Plain, \textbf{bold}, \textit{italic}, \emph{emphasis}, \texttt{mono}, \textsc{Small Caps},
\textsf{sans}, and a footnote.\footnote{Footnote.} See \url{https://example.com}.
\subsection{Math}
Inline $e^{i\pi} + 1 = 0$ and display
\[ \int_0^1 x^2 \, dx = \frac{1}{3}, \quad \sum_{k=1}^{n} k = \frac{n(n+1)}{2}, \quad \mathbb{R}, \mathcal{L}, \mathfrak{g} \]
\begin{align}
  a &= b + c \\
  \lVert x \rVert &\leq \sqrt{\alpha^2 + \beta^2}
\end{align}
\begin{theorem} Every bounded sequence has a convergent subsequence. \end{theorem}
\begin{proof} Classical. \end{proof}
\begin{itemize}[noitemsep]
  \item One
  \item Two
\end{itemize}
\begin{table}[h]
  \centering
  \begin{tabular}{lrr} \toprule Name & A & B \\ \midrule x & 1 & 2 \\ \bottomrule \end{tabular}
  \caption{A table.}
\end{table}
\begin{lstlisting}
print("hello")
\end{lstlisting}
\begin{tikzpicture} \draw[->] (0,0) -- (1,1); \node at (1,0) {$x$}; \end{tikzpicture}
\end{document}
`,
  resume: String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{fontawesome}
\usepackage{tgheros}
\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\titleformat{\section}{\scshape\raggedright\large}{}{0em}{}[\titlerule]
\begin{document}
\begin{center}
  {\Huge \scshape Jane Doe} \\
  \faPhone\ 555-0100 $|$ \faEnvelope\ \href{mailto:jane@example.com}{jane@example.com} $|$ \faGithub\ \faLinkedin
\end{center}
\section{Experience}
\begin{itemize}[leftmargin=0.15in, label={}]
  \item \textbf{Engineer} \hfill \textit{2020 to now} \Mundus
\end{itemize}
{\sffamily Sans serif line in TeX Gyre Heros, \textbf{bold}.}
\end{document}
`,
  modern: String.raw`\documentclass[12pt]{report}
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\usepackage{lmodern}
\usepackage{microtype}
\usepackage{parskip}
\usepackage{amsmath}
\begin{document}
\chapter{Modern fonts}
Latin Modern text with \textbf{bold}, \textit{italic}, \texttt{mono}, and $x^2 + y^2 = z^2$.
\end{document}
`,
};

if (!existsSync(tectonicPath)) {
  console.log(`Skipping Tectonic cache warm-up: no binary at ${tectonicPath}`);
  process.exit(0);
}

const workDir = mkdtempSync(path.join(tmpdir(), "latex-viewer-warmup-"));
const startedAt = Date.now();

for (const [name, source] of Object.entries(documents)) {
  const texPath = path.join(workDir, `${name}.tex`);
  writeFileSync(texPath, source);
  try {
    execFileSync(tectonicPath, [texPath, "--outdir", workDir, "--untrusted", "--chatter", "minimal"], {
      env: { ...process.env, HOME: workDir, XDG_CACHE_HOME: cacheDir },
      stdio: ["ignore", "ignore", "inherit"],
      timeout: 240_000,
    });
    console.log(`Warmed Tectonic cache with ${name}.tex`);
  } catch (error) {
    console.warn(`Tectonic warm-up for ${name}.tex failed: ${error instanceof Error ? error.message : error}`);
  }
}

rmSync(workDir, { force: true, recursive: true });

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
const megabytes = existsSync(cacheDir) ? (directorySize(cacheDir) / 1024 / 1024).toFixed(1) : "0";
console.log(`Tectonic cache ready in ${seconds} s (${megabytes} MB at ${cacheDir})`);

function directorySize(dir) {
  return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(dir, entry.name);
    return total + (entry.isDirectory() ? directorySize(entryPath) : statSync(entryPath).size);
  }, 0);
}
