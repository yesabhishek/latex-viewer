import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0c0c0d" }}>
        <svg width="180" height="180" viewBox="0 0 24 24">
          <path d="M5.75 6.5h9.5v2.6h-3.45v8.4H9.2V9.1H5.75z" fill="#fafafa" />
          <rect x="14.1" y="12.1" width="4.15" height="5.4" rx="0.7" fill="#6e8bff" />
        </svg>
      </div>
    ),
    size,
  );
}
