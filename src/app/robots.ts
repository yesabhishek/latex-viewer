import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

const crawlers = [
  "Googlebot",
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "PerplexityBot",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api/" }, ...crawlers.map((userAgent) => ({ userAgent, allow: "/", disallow: "/api/" }))],
    sitemap: `${siteConfig.url}/sitemap.xml`,
  };
}
