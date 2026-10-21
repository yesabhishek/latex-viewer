import { Workbench } from "@/components/workbench";
import { siteConfig } from "@/lib/site";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: siteConfig.name,
  alternateName: "Online LaTeX Viewer",
  url: `${siteConfig.url}/`,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  browserRequirements: "Requires a modern browser with JavaScript enabled.",
  description: siteConfig.description,
  featureList: [
    "Edit LaTeX source with syntax highlighting and autocomplete",
    "Open .tex files by picking or dropping them",
    "Compile LaTeX to PDF with Tectonic",
    "Preview compiled PDF output with selectable text and links",
    "Jump to compiler errors by line number",
    "Copy clean text or Markdown extracted from LaTeX",
  ],
  isAccessibleForFree: true,
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  creator: { "@type": "Person", name: siteConfig.author.name, url: siteConfig.author.url },
  sourceCode: siteConfig.repo,
  softwareVersion: "0.2.0",
};

export default function Home() {
  return (
    <>
      <h1 className="sr-only">{siteConfig.title}</h1>
      <Workbench />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
