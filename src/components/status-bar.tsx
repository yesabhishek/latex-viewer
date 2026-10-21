"use client";

import { useSyncExternalStore } from "react";

import type { CursorInfo } from "@/components/latex-editor";
import { createStore, formatDuration } from "@/lib/client";

export const cursorStore = createStore<CursorInfo>({ line: 1, column: 1, selected: 0, chars: 0, lines: 1 });

export type BuildSummary =
  | { state: "idle" }
  | { state: "compiling" }
  | { state: "success"; ms: number; cached: boolean; pages: number }
  | { state: "error"; line: number | null };

type StatusBarProps = {
  summary: BuildSummary;
  words: number;
  autoCompile: boolean;
  onToggleAuto: () => void;
  onShowProblem: () => void;
};

export function StatusBar({ summary, words, autoCompile, onToggleAuto, onShowProblem }: StatusBarProps) {
  const cursor = useSyncExternalStore(cursorStore.subscribe, cursorStore.get, cursorStore.get);

  return (
    <footer className="status-bar">
      <div className="status-group">
        {summary.state === "error" ? (
          <button type="button" className="status-item status-build is-error" onClick={onShowProblem}>
            <span className="status-dot" />
            Build failed{summary.line ? ` on line ${summary.line}` : ""}
          </button>
        ) : (
          <span className={`status-item status-build is-${summary.state}`}>
            <span className="status-dot" />
            {summary.state === "idle"
              ? "Ready"
              : summary.state === "compiling"
                ? "Compiling"
                : `${summary.cached ? "Cached" : `Compiled in ${formatDuration(summary.ms)}`}${
                    summary.pages ? ` · ${summary.pages} ${summary.pages === 1 ? "page" : "pages"}` : ""
                  }`}
          </span>
        )}
      </div>
      <div className="status-group">
        <span className="status-item">
          Ln {cursor.line}, Col {cursor.column}
          {cursor.selected ? ` (${cursor.selected.toLocaleString()} selected)` : ""}
        </span>
        <span className="status-item hide-sm">{words.toLocaleString()} words</span>
        <span className="status-item hide-sm">{cursor.chars.toLocaleString()} chars</span>
        <button
          type="button"
          className="status-item status-toggle"
          onClick={onToggleAuto}
          aria-pressed={autoCompile}
          title="Rebuild the PDF automatically as you type"
        >
          <span className={`status-switch ${autoCompile ? "is-on" : ""}`} aria-hidden="true" />
          Auto
        </button>
        <span className="status-item hide-sm">Tectonic</span>
      </div>
    </footer>
  );
}
