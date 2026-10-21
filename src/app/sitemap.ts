import type { MetadataRoute } from "next";

import { siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteConfig.url}/`, lastModified: new Date("2026-10-21"), changeFrequency: "weekly", priority: 1 }];
}
