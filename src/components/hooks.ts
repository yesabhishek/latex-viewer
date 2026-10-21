"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { isApplePlatform, readStored, writeStored } from "@/lib/client";

export type ThemePreference = "system" | "light" | "dark";

const THEME_KEY = "lv:theme";
const noopSubscribe = () => () => {};

export function useModKey() {
  return useSyncExternalStore(
    noopSubscribe,
    () => (isApplePlatform() ? "⌘" : "Ctrl"),
    () => "⌘",
  );
}

const themeListeners = new Set<() => void>();

function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const handleChange = () => {
    if (readPreference() === "system") {
      applyTheme("system");
    }
  };
  media.addEventListener("change", handleChange);
  return () => {
    themeListeners.delete(listener);
    media.removeEventListener("change", handleChange);
  };
}

function readPreference(): ThemePreference {
  const stored = readStored(THEME_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(preference: ThemePreference) {
  const dark =
    preference === "dark" || (preference === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeListeners.forEach((listener) => listener());
}

export function useTheme() {
  const resolved = useSyncExternalStore(
    subscribeTheme,
    () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    () => "light",
  );

  const setPreference = useCallback((preference: ThemePreference) => {
    writeStored(THEME_KEY, preference === "system" ? null : preference);
    applyTheme(preference);
  }, []);

  const toggle = useCallback(() => {
    setPreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  }, [setPreference]);

  return { resolved, setPreference, toggle };
}

export function useEvent<T extends keyof WindowEventMap>(
  type: T,
  handler: (event: WindowEventMap[T]) => void,
  options?: AddEventListenerOptions,
) {
  useEffect(() => {
    window.addEventListener(type, handler, options);
    return () => window.removeEventListener(type, handler, options);
  }, [type, handler, options]);
}
