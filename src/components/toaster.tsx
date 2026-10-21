"use client";

import { useCallback, useRef, useState } from "react";

export type Toast = { id: number; message: string; tone: "neutral" | "error" };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const notify = useCallback((message: string, tone: Toast["tone"] = "neutral") => {
    const id = nextId.current++;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 2600);
  }, []);

  return { toasts, notify };
}

export function Toaster({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone === "error" ? "is-error" : ""}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
