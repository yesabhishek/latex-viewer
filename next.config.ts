import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Resolved at runtime from node_modules so its optional platform binaries stay untouched.
  serverExternalPackages: ["node-latex-compiler"],
  outputFileTracingIncludes: {
    "/api/compile": ["./vendor/bin/**", "./node_modules/.cache/tectonic/**"],
  },
  outputFileTracingExcludes: {
    "/api/compile": ["./node_modules/@node-latex-compiler/**"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
        ],
      },
    ];
  },
};

export default nextConfig;
