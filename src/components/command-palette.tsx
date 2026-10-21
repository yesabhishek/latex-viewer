"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";

export type Command = {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  shortcut?: string[];
  keywords?: string;
  disabled?: boolean;
  run: () => void;
};

type CommandPaletteProps = {
  commands: Command[];
  onClose: () => void;
};

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter((command) => {
      if (command.disabled) {
        return false;
      }
      const haystack = `${command.label} ${command.group} ${command.keywords ?? ""}`.toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [commands, query]);

  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function run(command: Command | undefined) {
    if (!command) {
      return;
    }
    onClose();
    // Let focus return to the editor before the command runs.
    window.requestAnimationFrame(() => command.run());
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((activeIndex + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((activeIndex - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      event.preventDefault();
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="palette-search">
          <Search size={15} strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="Type a command"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[activeIndex] ? `${listId}-${results[activeIndex].id}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" id={listId} role="listbox" ref={listRef}>
          {results.length === 0 ? <div className="palette-empty">No matching commands</div> : null}
          {results.map((command, index) => {
            const showGroup = index === 0 || results[index - 1].group !== command.group;
            return (
              <div key={command.id} role="presentation">
                {showGroup ? <div className="palette-group">{command.group}</div> : null}
                <div
                  id={`${listId}-${command.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  data-index={index}
                  className="palette-item"
                  onMouseMove={() => index !== activeIndex && setActive(index)}
                  onClick={() => run(command)}
                >
                  <span className="palette-icon">{command.icon}</span>
                  <span className="palette-label">{command.label}</span>
                  {command.shortcut ? (
                    <span className="palette-shortcut">
                      {command.shortcut.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
