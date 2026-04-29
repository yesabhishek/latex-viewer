/// <reference types="vite/client" />

declare module "latex.js" {
  export interface LatexHtmlGenerator {
    htmlDocument(baseUrl?: string): Document;
    domFragment(): DocumentFragment;
  }

  export function parse(source: string, options?: Record<string, unknown>): LatexHtmlGenerator;

  export class HtmlGenerator {
    constructor(options?: Record<string, unknown>);
    stylesAndScripts(baseUrl?: string): DocumentFragment;
  }
}
