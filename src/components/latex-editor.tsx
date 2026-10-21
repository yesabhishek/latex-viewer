"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  snippetCompletion,
  type Completion,
  type CompletionContext,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { highlightSelectionMatches, openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { EditorSelection, EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
  rectangularSelection,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

import type { CompileIssue } from "@/lib/latex";

export type EditorHandle = {
  getValue: () => string;
  setValue: (value: string) => void;
  revealLine: (line: number) => void;
  openSearch: () => void;
  focus: () => void;
};

export type CursorInfo = {
  line: number;
  column: number;
  selected: number;
  chars: number;
  lines: number;
};

type LatexEditorProps = {
  ref?: Ref<EditorHandle>;
  loadInitialValue: () => string;
  issue: CompileIssue | null;
  onDocChange: () => void;
  onCursor: (info: CursorInfo) => void;
};

export function LatexEditor({ ref, loadInitialValue, issue, onDocChange, onCursor }: LatexEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const callbacks = useRef({ onDocChange, onCursor });

  useEffect(() => {
    callbacks.current = { onDocChange, onCursor };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: loadInitialValue(),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          indentOnInput(),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          StreamLanguage.define(stex),
          EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["{", "[", "(", "$"] } }]),
          syntaxHighlighting(latexHighlight),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ override: [latexCompletions], icons: false }),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          lintGutter(),
          EditorView.lineWrapping,
          placeholder("Start writing LaTeX, or drop a .tex file here"),
          keymap.of([
            ...closeBracketsKeymap,
            ...defaultKeymap,
            ...searchKeymap,
            ...historyKeymap,
            ...completionKeymap,
            indentWithTab,
          ]),
          EditorView.contentAttributes.of({ "aria-label": "LaTeX source", spellcheck: "false" }),
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              callbacks.current.onDocChange();
            }
            if (update.docChanged || update.selectionSet) {
              callbacks.current.onCursor(readCursor(update.state));
            }
          }),
        ],
      }),
    });

    viewRef.current = view;
    callbacks.current.onCursor(readCursor(view.state));

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor owns its document after mount; loadInitialValue only seeds it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }

    if (!issue?.line) {
      view.dispatch(setDiagnostics(view.state, []));
      return;
    }

    const line = view.state.doc.line(Math.min(Math.max(issue.line, 1), view.state.doc.lines));
    view.dispatch(
      setDiagnostics(view.state, [
        { from: line.from, to: line.to, severity: "error", message: issue.message, source: "Tectonic" },
      ]),
    );
  }, [issue]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? "",
      setValue(value) {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: value },
          selection: EditorSelection.cursor(0),
          scrollIntoView: true,
        });
      },
      revealLine(lineNumber) {
        const view = viewRef.current;
        if (!view) {
          return;
        }
        const line = view.state.doc.line(Math.min(Math.max(lineNumber, 1), view.state.doc.lines));
        view.dispatch({
          selection: EditorSelection.range(line.from, line.to),
          effects: EditorView.scrollIntoView(line.from, { y: "center" }),
        });
        view.focus();
      },
      openSearch() {
        if (viewRef.current) {
          openSearchPanel(viewRef.current);
        }
      },
      focus: () => viewRef.current?.focus(),
    }),
    [],
  );

  return <div className="editor-host" ref={hostRef} />;
}

function readCursor(state: EditorState): CursorInfo {
  const range = state.selection.main;
  const line = state.doc.lineAt(range.head);
  return {
    line: line.number,
    column: range.head - line.from + 1,
    selected: Math.abs(range.to - range.from),
    chars: state.doc.length,
    lines: state.doc.lines,
  };
}

const latexHighlight = HighlightStyle.define([
  { tag: t.tagName, color: "var(--syn-command)" },
  { tag: t.keyword, color: "var(--syn-math)" },
  { tag: t.special(t.variableName), color: "var(--syn-math)" },
  { tag: t.atom, color: "var(--syn-env)" },
  { tag: t.number, color: "var(--syn-number)" },
  { tag: t.bracket, color: "var(--syn-bracket)" },
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: t.invalid, color: "var(--danger)" },
]);

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "transparent",
    fontSize: "13px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.65",
    overflow: "auto",
  },
  ".cm-content": { padding: "14px 0 40vh", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 20px 0 12px" },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--accent)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--selection) !important" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    border: "none",
    paddingLeft: "8px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px", padding: "0 4px 0 0" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-muted)" },
  ".cm-gutter-lint": { width: "10px" },
  ".cm-gutter-lint .cm-gutterElement": { padding: "0" },
  ".cm-lint-marker": { width: "6px", height: "6px", margin: "8px 0 0 2px", borderRadius: "50%", content: "none" },
  ".cm-lint-marker-error": { backgroundColor: "var(--danger)", content: "none" },
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--danger)",
    textDecorationSkipInk: "none",
    textUnderlineOffset: "3px",
  },
  ".cm-matchingBracket": { backgroundColor: "var(--bracket-match)", outline: "none", color: "inherit" },
  ".cm-selectionMatch": { backgroundColor: "var(--selection-match)" },
  ".cm-searchMatch": { backgroundColor: "var(--search-match)", outline: "1px solid var(--search-outline)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--search-outline)" },
  ".cm-placeholder": { color: "var(--text-faint)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface-raised)",
    color: "var(--text)",
    border: "1px solid var(--border-strong)",
    borderRadius: "8px",
    boxShadow: "var(--shadow-pop)",
    overflow: "hidden",
  },
  ".cm-tooltip-lint": { padding: "0" },
  ".cm-diagnostic": { padding: "8px 12px", borderLeft: "none", fontFamily: "var(--font-sans)", fontSize: "12.5px" },
  ".cm-diagnostic-error": { borderLeft: "2px solid var(--danger)" },
  ".cm-diagnosticSource": { color: "var(--text-muted)", opacity: "1" },
  ".cm-tooltip.cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    fontSize: "12.5px",
    maxHeight: "16em",
    padding: "4px",
  },
  ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
    padding: "3px 8px",
    borderRadius: "5px",
    lineHeight: "1.5",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent-soft)",
    color: "var(--text)",
  },
  ".cm-completionDetail": {
    fontFamily: "var(--font-sans)",
    fontStyle: "normal",
    color: "var(--text-muted)",
    marginLeft: "12px",
  },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)" },
  ".cm-panels": { backgroundColor: "var(--surface)", color: "var(--text)" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-search": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
  },
  ".cm-search br": { display: "none" },
  ".cm-search label": { display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-muted)" },
  ".cm-textfield": {
    height: "26px",
    padding: "0 8px",
    border: "1px solid var(--border-strong)",
    borderRadius: "6px",
    backgroundColor: "var(--surface-sunken)",
    color: "var(--text)",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
  },
  ".cm-textfield:focus": { outline: "none", borderColor: "var(--accent)" },
  ".cm-button": {
    height: "26px",
    padding: "0 10px",
    border: "1px solid var(--border-strong)",
    borderRadius: "6px",
    backgroundImage: "none",
    backgroundColor: "var(--surface-raised)",
    color: "var(--text)",
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    textTransform: "capitalize",
  },
  ".cm-search button[name=close]": {
    marginLeft: "auto",
    color: "var(--text-muted)",
    fontSize: "16px",
    cursor: "pointer",
  },
});

const commandCompletions: Completion[] = [
  snippetCompletion("\\section{${title}}", { label: "\\section", detail: "Section", type: "keyword" }),
  snippetCompletion("\\subsection{${title}}", { label: "\\subsection", detail: "Subsection", type: "keyword" }),
  snippetCompletion("\\subsubsection{${title}}", { label: "\\subsubsection", detail: "Subsubsection", type: "keyword" }),
  snippetCompletion("\\paragraph{${title}}", { label: "\\paragraph", detail: "Paragraph heading", type: "keyword" }),
  snippetCompletion("\\textbf{${text}}", { label: "\\textbf", detail: "Bold" }),
  snippetCompletion("\\textit{${text}}", { label: "\\textit", detail: "Italic" }),
  snippetCompletion("\\emph{${text}}", { label: "\\emph", detail: "Emphasis" }),
  snippetCompletion("\\underline{${text}}", { label: "\\underline", detail: "Underline" }),
  snippetCompletion("\\texttt{${text}}", { label: "\\texttt", detail: "Monospace" }),
  snippetCompletion("\\textsc{${text}}", { label: "\\textsc", detail: "Small caps" }),
  snippetCompletion("\\href{${url}}{${label}}", { label: "\\href", detail: "Link" }),
  snippetCompletion("\\url{${url}}", { label: "\\url", detail: "URL" }),
  snippetCompletion("\\frac{${num}}{${den}}", { label: "\\frac", detail: "Fraction" }),
  snippetCompletion("\\sqrt{${x}}", { label: "\\sqrt", detail: "Square root" }),
  snippetCompletion("\\sum_{${i=1}}^{${n}}", { label: "\\sum", detail: "Summation" }),
  snippetCompletion("\\int_{${a}}^{${b}}", { label: "\\int", detail: "Integral" }),
  snippetCompletion("\\label{${key}}", { label: "\\label", detail: "Label" }),
  snippetCompletion("\\ref{${key}}", { label: "\\ref", detail: "Reference" }),
  snippetCompletion("\\cite{${key}}", { label: "\\cite", detail: "Citation" }),
  snippetCompletion("\\footnote{${text}}", { label: "\\footnote", detail: "Footnote" }),
  snippetCompletion("\\usepackage{${package}}", { label: "\\usepackage", detail: "Load package" }),
  snippetCompletion("\\documentclass{${article}}", { label: "\\documentclass", detail: "Document class" }),
  snippetCompletion("\\includegraphics[width=${\\linewidth}]{${file}}", {
    label: "\\includegraphics",
    detail: "Image",
  }),
  snippetCompletion("\\vspace{${1em}}", { label: "\\vspace", detail: "Vertical space" }),
  snippetCompletion("\\hspace{${1em}}", { label: "\\hspace", detail: "Horizontal space" }),
  { label: "\\item", detail: "List item", apply: "\\item " },
  { label: "\\maketitle", detail: "Title block" },
  { label: "\\tableofcontents", detail: "Contents" },
  { label: "\\newpage", detail: "Page break" },
  { label: "\\noindent", detail: "No indent" },
  { label: "\\centering", detail: "Center content" },
  { label: "\\today", detail: "Current date" },
  { label: "\\hfill", detail: "Fill space" },
  { label: "\\alpha" },
  { label: "\\beta" },
  { label: "\\gamma" },
  { label: "\\delta" },
  { label: "\\epsilon" },
  { label: "\\theta" },
  { label: "\\lambda" },
  { label: "\\mu" },
  { label: "\\pi" },
  { label: "\\sigma" },
  { label: "\\omega" },
  { label: "\\infty" },
  { label: "\\cdot" },
  { label: "\\times" },
  { label: "\\leq" },
  { label: "\\geq" },
  { label: "\\neq" },
  { label: "\\approx" },
  { label: "\\rightarrow" },
];

const environments: Array<[name: string, detail: string, body?: string]> = [
  ["itemize", "Bulleted list", "\\item ${}"],
  ["enumerate", "Numbered list", "\\item ${}"],
  ["description", "Description list", "\\item[${term}] ${}"],
  ["equation", "Numbered equation"],
  ["equation*", "Equation"],
  ["align", "Aligned equations"],
  ["align*", "Aligned equations, unnumbered"],
  ["figure", "Figure", "\\centering\n\t${}\n\t\\caption{${caption}}"],
  ["table", "Table", "\\centering\n\t${}\n\t\\caption{${caption}}"],
  ["tabular", "Tabular"],
  ["center", "Centered block"],
  ["quote", "Quotation"],
  ["verbatim", "Verbatim"],
  ["abstract", "Abstract"],
  ["minipage", "Minipage"],
];

const environmentCompletions: Completion[] = environments.map(([name, detail, body]) => {
  const opening = name === "tabular" ? `\\begin{tabular}{\${ll}}` : name === "minipage" ? `\\begin{minipage}{\${0.5\\linewidth}}` : `\\begin{${name}}`;
  return snippetCompletion(`${opening}\n\t${body ?? "${}"}\n\\end{${name}}`, {
    label: `\\begin{${name}}`,
    detail,
    type: "type",
  });
});

const allCompletions = [...commandCompletions, ...environmentCompletions];

function latexCompletions(context: CompletionContext) {
  const word = context.matchBefore(/\\[a-zA-Z{}*]*/);
  if (!word || (word.from === word.to && !context.explicit)) {
    return null;
  }
  return { from: word.from, options: allCompletions, validFor: /^\\[a-zA-Z{}*]*$/ };
}
