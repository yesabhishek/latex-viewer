import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Resolved at runtime from node_modules so its optional platform binaries stay untouched.
  serverExternalPackages: ["node-latex-compiler"],
  outputFileTracingIncludes: {
    "/api/compile": ["./vendor/bin/**"],
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
        ],
      },
    ];
  },
};

export default nextConfig;
