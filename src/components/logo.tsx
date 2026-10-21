export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6.5" fill="var(--logo-bg)" />
      <path d="M5.75 6.5h9.5v2.6h-3.45v8.4H9.2V9.1H5.75z" fill="var(--logo-fg)" />
      <rect x="14.1" y="12.1" width="4.15" height="5.4" rx="0.7" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <LogoMark />
      <span className="wordmark-text">
        LaTeX <span>Viewer</span>
      </span>
    </span>
  );
}
