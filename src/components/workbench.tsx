"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileText,
  FileUp,
  Hash,
  LoaderCircle,
  Minus,
  Moon,
  Monitor,
  Play,
  Plus,
  RotateCcw,
  ScrollText,
  Search,
  Sun,
  TextSearch,
  X,
  Zap,
} from "lucide-react";

import { CommandPalette, type Command } from "@/components/command-palette";
import { useModKey, useTheme } from "@/components/hooks";
import { LatexEditor, type EditorHandle } from "@/components/latex-editor";
import { Wordmark } from "@/components/logo";
import { loadPdfJs, PdfViewer } from "@/components/pdf-viewer";
import { cursorStore, StatusBar, type BuildSummary } from "@/components/status-bar";
import { Toaster, useToasts } from "@/components/toaster";
import { copyText, downloadBlob, formatDuration, hashString, readStored, writeStored } from "@/lib/client";
import {
  countWords,
  extractCleanMarkdown,
  extractCleanText,
  parseCompileIssue,
  starterLatex,
  type CompileIssue,
} from "@/lib/latex";
import { siteConfig } from "@/lib/site";

type View = "pdf" | "text" | "markdown";
type Pane = "source" | "preview";
type Build = { blob: Blob; data: ArrayBuffer; ms: number; cached: boolean; hash: string };
type Failure = CompileIssue & { log: string };

const KEYS = {
  source: "lv:source",
  file: "lv:file",
  split: "lv:split",
  view: "lv:view",
  auto: "lv:auto",
} as const;

const DEFAULT_FILE = "document.tex";
const COMPILE_DELAY_MS = 500;
const BUILD_CACHE_SIZE = 8;
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const VIEWS: Array<{ id: View; label: string }> = [
  { id: "pdf", label: "PDF" },
  { id: "text", label: "Text" },
  { id: "markdown", label: "Markdown" },
];

class CompileError extends Error {
  constructor(
    message: string,
    readonly log: string,
  ) {
    super(message);
  }
}

export function Workbench() {
  const mod = useModKey();
  const theme = useTheme();
  const { toasts, notify } = useToasts();

  const editorRef = useRef<EditorHandle>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef(0);
  const compileRun = useRef(0);
  const compileAbort = useRef<AbortController | null>(null);
  const requestedHash = useRef("");
  const buildCache = useRef(new Map<string, Build>());
  const autoCompileRef = useRef(true);

  const [fileName, setFileName] = useState(DEFAULT_FILE);
  const [view, setView] = useState<View>("pdf");
  const [pane, setPane] = useState<Pane>("source");
  const [autoCompile, setAutoCompile] = useState(true);
  const [snapshot, setSnapshot] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [build, setBuild] = useState<Build | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const compile = useCallback(async (source: string, force = false) => {
    const hash = hashString(source);
    if (!force && hash === requestedHash.current) {
      return;
    }
    requestedHash.current = hash;

    const cached = buildCache.current.get(hash);
    if (cached && !force) {
      compileRun.current += 1;
      compileAbort.current?.abort();
      buildCache.current.delete(hash);
      buildCache.current.set(hash, cached);
      setBuild({ ...cached, cached: true, ms: 0 });
      setFailure(null);
      setCompiling(false);
      return;
    }

    const run = ++compileRun.current;
    compileAbort.current?.abort();
    const controller = new AbortController();
    compileAbort.current = controller;
    setCompiling(true);
    const startedAt = performance.now();

    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string; log?: string };
        throw new CompileError(body.error ?? "LaTeX compilation failed.", body.log ?? "");
      }

      const blob = await response.blob();
      const data = await blob.arrayBuffer();
      if (run !== compileRun.current) {
        return;
      }

      const next: Build = {
        blob,
        data,
        hash,
        ms: performance.now() - startedAt,
        cached: response.headers.get("x-compile-cache") === "hit",
      };
      buildCache.current.set(hash, next);
      if (buildCache.current.size > BUILD_CACHE_SIZE) {
        buildCache.current.delete(buildCache.current.keys().next().value as string);
      }
      setBuild(next);
      setFailure(null);
      setShowLog(false);
    } catch (error) {
      if (run !== compileRun.current || controller.signal.aborted) {
        return;
      }
      requestedHash.current = "";
      const log =
        error instanceof CompileError
          ? [error.message, error.log].filter(Boolean).join("\n\n")
          : "Could not reach the compiler. Check your connection and try again.";
      setFailure({ ...parseCompileIssue(log), log });
      setProblemsOpen(true);
    } finally {
      if (run === compileRun.current) {
        setCompiling(false);
      }
    }
  }, []);

  const flushSource = useCallback(
    (force = false) => {
      window.clearTimeout(debounceTimer.current);
      const source = editorRef.current?.getValue() ?? "";
      setSnapshot(source);
      writeStored(KEYS.source, source === starterLatex ? null : source);
      if (autoCompileRef.current || force) {
        void compile(source, force);
      }
    },
    [compile],
  );

  const handleDocChange = useCallback(() => {
    window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => flushSource(), COMPILE_DELAY_MS);
  }, [flushSource]);

  // Restore per-browser preferences and start the first build. The editor mounts first, so its
  // document is ready to read here.
  useEffect(() => {
    const storedView = readStored(KEYS.view);
    const storedSplit = Number(readStored(KEYS.split));
    const storedAuto = readStored(KEYS.auto) !== "off";
    autoCompileRef.current = storedAuto;
    if (storedSplit >= 20 && storedSplit <= 80) {
      workspaceRef.current?.style.setProperty("--split", `${storedSplit}%`);
    }
    /* eslint-disable react-hooks/set-state-in-effect -- syncing from localStorage after hydration */
    setFileName(readStored(KEYS.file) ?? DEFAULT_FILE);
    setView(storedView === "text" || storedView === "markdown" ? storedView : "pdf");
    setAutoCompile(storedAuto);
    /* eslint-enable react-hooks/set-state-in-effect */
    flushSource(true);
    void loadPdfJs().catch(() => undefined);
  }, [flushSource]);

  useEffect(() => {
    return () => {
      window.clearTimeout(debounceTimer.current);
      compileAbort.current?.abort();
    };
  }, []);

  const openFile = useCallback(
    (file: File) => {
      if (!/\.(tex|ltx|latex)$/i.test(file.name)) {
        notify("Only .tex files can be opened.", "error");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        editorRef.current?.setValue(String(reader.result ?? ""));
        setFileName(file.name);
        writeStored(KEYS.file, file.name);
        setPane("source");
        flushSource(true);
      };
      reader.onerror = () => notify("Could not read that file.", "error");
      reader.readAsText(file);
    },
    [flushSource, notify],
  );

  const restoreSample = useCallback(() => {
    editorRef.current?.setValue(starterLatex);
    setFileName(DEFAULT_FILE);
    writeStored(KEYS.file, null);
    flushSource(true);
    notify(`Sample restored. Press ${mod === "⌘" ? "⌘Z" : "Ctrl+Z"} to undo.`);
  }, [flushSource, mod, notify]);

  const pdfName = fileName.replace(/\.(tex|ltx|latex)$/i, "") + ".pdf";

  const downloadPdf = useCallback(() => {
    if (build) {
      downloadBlob(build.blob, pdfName);
    }
  }, [build, pdfName]);

  const openPdf = useCallback(() => {
    if (!build) {
      return;
    }
    const url = URL.createObjectURL(build.blob);
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [build]);

  const textOutput = useMemo(() => (view === "text" ? extractCleanText(snapshot) : ""), [view, snapshot]);
  const markdownOutput = useMemo(() => (view === "markdown" ? extractCleanMarkdown(snapshot) : ""), [view, snapshot]);
  const words = useMemo(() => countWords(snapshot), [snapshot]);

  const copyOutput = useCallback(
    async (kind: "text" | "markdown" | "source") => {
      const payload =
        kind === "source"
          ? (editorRef.current?.getValue() ?? "")
          : kind === "markdown"
            ? extractCleanMarkdown(editorRef.current?.getValue() ?? "")
            : extractCleanText(editorRef.current?.getValue() ?? "");
      try {
        await copyText(payload);
        if (kind === view) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        }
        notify(kind === "source" ? "Copied LaTeX source" : kind === "markdown" ? "Copied as Markdown" : "Copied as text");
      } catch {
        notify("Copy failed. Your browser blocked clipboard access.", "error");
      }
    },
    [notify, view],
  );

  const changeView = useCallback((next: View) => {
    setView(next);
    setPane("preview");
    writeStored(KEYS.view, next === "pdf" ? null : next);
  }, []);

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.findIndex((step) => step >= current - 0.001);
      const nextIndex = Math.min(Math.max((index === -1 ? 4 : index) + direction, 0), ZOOM_STEPS.length - 1);
      return ZOOM_STEPS[nextIndex];
    });
  }, []);

  const toggleAuto = useCallback(() => {
    const next = !autoCompileRef.current;
    autoCompileRef.current = next;
    setAutoCompile(next);
    writeStored(KEYS.auto, next ? null : "off");
    if (next) {
      flushSource();
    }
  }, [flushSource]);

  const revealProblem = useCallback(() => {
    setProblemsOpen(true);
    setPane("source");
    if (failure?.line) {
      editorRef.current?.revealLine(failure.line);
    }
  }, [failure]);

  const handlePdfLoaded = useCallback((count: number) => setPages(count), []);
  const handlePdfError = useCallback((message: string) => notify(message, "error"), [notify]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const modPressed = event.metaKey || event.ctrlKey;
      if (!modPressed || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "k" || (key === "p" && event.shiftKey)) {
        setPaletteOpen((open) => !open);
      } else if (key === "s" || key === "enter") {
        flushSource(true);
      } else if (key === "o") {
        fileInputRef.current?.click();
      } else {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [flushSource]);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const handleEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth += 1;
      setDragging(true);
    };
    const handleOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const handleLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const file = event.dataTransfer?.files[0];
      if (file) openFile(file);
    };
    window.addEventListener("dragenter", handleEnter);
    window.addEventListener("dragover", handleOver);
    window.addEventListener("dragleave", handleLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleEnter);
      window.removeEventListener("dragover", handleOver);
      window.removeEventListener("dragleave", handleLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [openFile]);

  function startSplitDrag(event: React.PointerEvent<HTMLDivElement>) {
    const workspace = workspaceRef.current;
    if (!workspace || event.button !== 0) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add("is-resizing");
    const rect = workspace.getBoundingClientRect();
    let percent = 50;

    const move = (moveEvent: PointerEvent) => {
      percent = Math.min(80, Math.max(20, ((moveEvent.clientX - rect.left) / rect.width) * 100));
      workspace.style.setProperty("--split", `${percent.toFixed(2)}%`);
    };
    const end = () => {
      document.body.classList.remove("is-resizing");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
      writeStored(KEYS.split, percent.toFixed(1));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  function nudgeSplit(event: React.KeyboardEvent<HTMLDivElement>) {
    const workspace = workspaceRef.current;
    if (!workspace || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) {
      return;
    }
    event.preventDefault();
    const current = parseFloat(workspace.style.getPropertyValue("--split")) || 50;
    const next = Math.min(80, Math.max(20, current + (event.key === "ArrowLeft" ? -2 : 2)));
    workspace.style.setProperty("--split", `${next}%`);
    writeStored(KEYS.split, next.toFixed(1));
  }

  function resetSplit() {
    workspaceRef.current?.style.setProperty("--split", "50%");
    writeStored(KEYS.split, null);
  }

  const commands = useMemo<Command[]>(() => {
    const iconSize = 15;
    return [
      {
        id: "compile",
        group: "Build",
        label: "Compile now",
        icon: <Play size={iconSize} />,
        shortcut: [mod, "S"],
        keywords: "build render run pdf",
        run: () => flushSource(true),
      },
      {
        id: "auto",
        group: "Build",
        label: autoCompile ? "Turn off auto compile" : "Turn on auto compile",
        icon: <Zap size={iconSize} />,
        keywords: "live automatic",
        run: toggleAuto,
      },
      {
        id: "problem",
        group: "Build",
        label: failure?.line ? `Go to error on line ${failure.line}` : "Show build problems",
        icon: <CircleAlert size={iconSize} />,
        keywords: "error log problems",
        disabled: !failure,
        run: revealProblem,
      },
      {
        id: "import",
        group: "File",
        label: "Open .tex file",
        icon: <FileUp size={iconSize} />,
        shortcut: [mod, "O"],
        keywords: "import upload load",
        run: () => fileInputRef.current?.click(),
      },
      {
        id: "download",
        group: "File",
        label: "Download PDF",
        icon: <Download size={iconSize} />,
        keywords: "save export",
        disabled: !build,
        run: downloadPdf,
      },
      {
        id: "open-pdf",
        group: "File",
        label: "Open PDF in new tab",
        icon: <ExternalLink size={iconSize} />,
        keywords: "print browser",
        disabled: !build,
        run: openPdf,
      },
      {
        id: "copy-source",
        group: "File",
        label: "Copy LaTeX source",
        icon: <FileCode size={iconSize} />,
        run: () => void copyOutput("source"),
      },
      {
        id: "copy-text",
        group: "File",
        label: "Copy as plain text",
        icon: <FileText size={iconSize} />,
        run: () => void copyOutput("text"),
      },
      {
        id: "copy-markdown",
        group: "File",
        label: "Copy as Markdown",
        icon: <Hash size={iconSize} />,
        run: () => void copyOutput("markdown"),
      },
      {
        id: "restore",
        group: "File",
        label: "Restore sample document",
        icon: <RotateCcw size={iconSize} />,
        keywords: "reset new starter template",
        run: restoreSample,
      },
      {
        id: "find",
        group: "Editor",
        label: "Find in source",
        icon: <TextSearch size={iconSize} />,
        shortcut: [mod, "F"],
        keywords: "search replace",
        run: () => editorRef.current?.openSearch(),
      },
      ...VIEWS.map(({ id, label }) => ({
        id: `view-${id}`,
        group: "View",
        label: `Show ${label} preview`,
        icon: id === "pdf" ? <ScrollText size={iconSize} /> : id === "text" ? <FileText size={iconSize} /> : <Hash size={iconSize} />,
        keywords: "preview mode",
        run: () => changeView(id),
      })),
      {
        id: "zoom-in",
        group: "View",
        label: "Zoom in",
        icon: <Plus size={iconSize} />,
        run: () => stepZoom(1),
      },
      {
        id: "zoom-out",
        group: "View",
        label: "Zoom out",
        icon: <Minus size={iconSize} />,
        run: () => stepZoom(-1),
      },
      {
        id: "zoom-reset",
        group: "View",
        label: "Reset zoom",
        icon: <Search size={iconSize} />,
        keywords: "fit width 100",
        run: () => setZoom(1),
      },
      {
        id: "theme-toggle",
        group: "Appearance",
        label: theme.resolved === "dark" ? "Switch to light theme" : "Switch to dark theme",
        icon: theme.resolved === "dark" ? <Sun size={iconSize} /> : <Moon size={iconSize} />,
        keywords: "color mode appearance",
        run: theme.toggle,
      },
      {
        id: "theme-system",
        group: "Appearance",
        label: "Match system theme",
        icon: <Monitor size={iconSize} />,
        keywords: "color mode appearance auto",
        run: () => theme.setPreference("system"),
      },
    ];
  }, [
    autoCompile,
    build,
    changeView,
    copyOutput,
    downloadPdf,
    failure,
    flushSource,
    mod,
    openPdf,
    restoreSample,
    revealProblem,
    stepZoom,
    theme,
    toggleAuto,
  ]);

  const summary: BuildSummary = compiling
    ? { state: "compiling" }
    : failure
      ? { state: "error", line: failure.line }
      : build
        ? { state: "success", ms: build.ms, cached: build.cached, pages }
        : { state: "idle" };

  const copyKind = view === "markdown" ? "markdown" : "text";

  return (
    <div className="app" data-pane={pane}>
      <header className="titlebar">
        <div className="titlebar-start">
          <Wordmark />
        </div>

        <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)}>
          <Search size={14} aria-hidden="true" />
          <span>Search commands</span>
          <kbd>{mod}</kbd>
          <kbd>K</kbd>
        </button>

        <div className="titlebar-end">
          <button
            type="button"
            className="icon-button show-sm"
            onClick={() => setPaletteOpen(true)}
            aria-label="Open command palette"
          >
            <Search size={16} />
          </button>
          <button type="button" className="button ghost hide-sm" onClick={() => fileInputRef.current?.click()}>
            <FileUp size={15} aria-hidden="true" />
            Open
          </button>
          <button type="button" className="button ghost hide-sm" onClick={downloadPdf} disabled={!build}>
            <Download size={15} aria-hidden="true" />
            Download
          </button>
          <button type="button" className="icon-button" onClick={theme.toggle} aria-label="Toggle color theme">
            <Sun size={16} className="theme-icon-light" />
            <Moon size={16} className="theme-icon-dark" />
          </button>
          <a
            className="icon-button hide-sm"
            href={siteConfig.repo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Source code on GitHub"
          >
            <GitHubIcon />
          </a>
          <button
            type="button"
            className="button primary"
            onClick={() => flushSource(true)}
            aria-busy={compiling}
            title={`Compile (${mod === "⌘" ? "⌘S" : "Ctrl+S"})`}
          >
            {compiling ? <LoaderCircle size={14} className="spin" aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            Compile
            <kbd className="hide-sm">{mod === "⌘" ? "⌘S" : "Ctrl S"}</kbd>
          </button>
        </div>
      </header>

      <nav className="pane-switch" aria-label="Panes">
        <button type="button" aria-pressed={pane === "source"} onClick={() => setPane("source")}>
          Source
        </button>
        <button type="button" aria-pressed={pane === "preview"} onClick={() => setPane("preview")}>
          Preview
          {failure ? <span className="pane-switch-dot" aria-label="Build failed" /> : null}
        </button>
      </nav>

      <main className="workspace" ref={workspaceRef}>
        <section className="pane pane-source" aria-label="LaTeX source">
          <div className="pane-header">
            <div className="tab is-active">
              <FileCode size={13} aria-hidden="true" />
              {fileName}
            </div>
          </div>
          <div className="editor-frame">
            <LatexEditor
              ref={editorRef}
              loadInitialValue={loadStoredSource}
              issue={failure}
              onDocChange={handleDocChange}
              onCursor={cursorStore.set}
            />
          </div>
          {failure && problemsOpen ? (
            <div className="problems" role="region" aria-label="Build problems">
              <div className="problems-header">
                <span className="problems-title">
                  Problems <span className="count">1</span>
                </span>
                <div className="problems-actions">
                  <button type="button" className="text-button" onClick={() => setShowLog((open) => !open)}>
                    {showLog ? "Hide log" : "Show log"}
                    <ChevronDown size={13} className={showLog ? "flip" : ""} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="icon-button small"
                    onClick={() => setProblemsOpen(false)}
                    aria-label="Close problems"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <button type="button" className="problem" onClick={revealProblem}>
                <CircleAlert size={14} className="problem-icon" aria-hidden="true" />
                <span className="problem-message">{failure.message}</span>
                {failure.line ? <span className="problem-line">Ln {failure.line}</span> : null}
              </button>
              {showLog ? <pre className="problem-log">{failure.log}</pre> : null}
            </div>
          ) : null}
        </section>

        <div
          className="splitter"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panes"
          tabIndex={0}
          onPointerDown={startSplitDrag}
          onKeyDown={nudgeSplit}
          onDoubleClick={resetSplit}
        />

        <section className="pane pane-preview" aria-label="Preview">
          <div className="pane-header">
            <div className="segmented" role="tablist" aria-label="Preview format">
              {VIEWS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={view === id}
                  className={view === id ? "is-active" : ""}
                  onClick={() => changeView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="pane-tools">
              {view === "pdf" ? (
                <>
                  <div className="zoom" role="group" aria-label="Zoom">
                    <button type="button" onClick={() => stepZoom(-1)} aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]}>
                      <Minus size={14} />
                    </button>
                    <button type="button" className="zoom-value" onClick={() => setZoom(1)} title="Fit to width">
                      {Math.round(zoom * 100)}%
                    </button>
                    <button
                      type="button"
                      onClick={() => stepZoom(1)}
                      aria-label="Zoom in"
                      disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={openPdf}
                    disabled={!build}
                    aria-label="Open PDF in new tab"
                    title="Open in new tab"
                  >
                    <ExternalLink size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button show-sm"
                    onClick={downloadPdf}
                    disabled={!build}
                    aria-label="Download PDF"
                  >
                    <Download size={15} />
                  </button>
                </>
              ) : (
                <button type="button" className="button ghost small" onClick={() => void copyOutput(copyKind)}>
                  {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                  {copied ? "Copied" : view === "markdown" ? "Copy Markdown" : "Copy text"}
                </button>
              )}
            </div>
          </div>

          <div className="preview-body">
            <div className={`progress ${compiling ? "is-active" : ""}`} aria-hidden="true" />
            {view === "pdf" ? (
              build || !failure ? (
                <>
                  <PdfViewer
                    data={build?.data ?? null}
                    zoom={zoom}
                    onZoomStep={stepZoom}
                    onLoaded={handlePdfLoaded}
                    onError={handlePdfError}
                  />
                  {failure && build ? (
                    <button type="button" className="stale-banner" onClick={revealProblem}>
                      <CircleAlert size={14} aria-hidden="true" />
                      <span>Showing the last successful build.</span>
                      <span className="stale-link">{failure.line ? `Go to line ${failure.line}` : "View problem"}</span>
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="empty-state">
                  <div className="empty-icon">
                    <CircleAlert size={18} />
                  </div>
                  <h2>No preview yet</h2>
                  <p>{failure.message}</p>
                  <button type="button" className="button" onClick={revealProblem}>
                    {failure.line ? `Go to line ${failure.line}` : "View problem"}
                  </button>
                </div>
              )
            ) : (
              <div className="text-scroll">
                <pre className={`text-output ${view === "markdown" ? "is-markdown" : ""}`} style={{ fontSize: `${zoom * 14}px` }}>
                  {view === "markdown" ? markdownOutput : textOutput}
                </pre>
              </div>
            )}
          </div>
        </section>
      </main>

      <StatusBar
        summary={summary}
        words={words}
        autoCompile={autoCompile}
        onToggleAuto={toggleAuto}
        onShowProblem={revealProblem}
      />

      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept=".tex,.ltx,.latex,text/x-tex"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            openFile(file);
          }
          event.currentTarget.value = "";
        }}
      />

      {dragging ? (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <FileUp size={20} />
            <strong>Drop to open</strong>
            <span>.tex files replace the current source</span>
          </div>
        </div>
      ) : null}

      {paletteOpen ? <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} /> : null}

      <Toaster toasts={toasts} />

      <span className="sr-only" aria-live="polite">
        {failure ? `Build failed. ${failure.message}` : build && !compiling ? `Compiled in ${formatDuration(build.ms)}` : ""}
      </span>
    </div>
  );
}

function loadStoredSource() {
  return readStored(KEYS.source) ?? starterLatex;
}

function GitHubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.02c-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}
