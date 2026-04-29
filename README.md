# LaTeX Viewer

A lightweight LaTeX editor and PDF viewer built with Vite, React, and a Vercel serverless Tectonic compiler.

The app has no auth, database, uploads, or stored user content. LaTeX is posted only to `/api/compile` for the current compile request and the temporary files are deleted after the PDF is returned.

## Run Locally

```sh
npm install
npm run dev
```

Open the local URL Vite prints in the terminal. The Vite dev server includes the same local `/api/compile` middleware used by the Vercel function, so PDF compilation works on `localhost:5173`.

The first compile can be slower while Tectonic warms its package cache.

## Build

```sh
npm run build
```

The static output is written to `dist/`.

## Deploy on Vercel

Vercel can deploy the Vite app plus the `/api/compile` serverless function using:

- Build command: `npm run build`
- Output directory: `dist`

Those settings are also captured in `vercel.json`.

## Notes

- Preview mode `PDF` renders the compiled PDF in-browser.
- Preview mode `Text` extracts a quick clean-text view from the LaTeX source.
- Zoom controls affect only the preview pane.
- The compiler includes a compatibility shim for resume templates that use `fontawesome5` and `glyphtounicode`, both common in Overleaf/pdfTeX templates.

## License

MIT. Use it, fork it, and adapt it freely.
