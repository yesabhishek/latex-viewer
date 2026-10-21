# LaTeX Viewer

A fast, focused LaTeX editor with a live PDF preview. Write or drop in a `.tex` file, and the PDF rebuilds a moment after you stop typing.

Live at [latex-viewer-alpha.vercel.app](https://latex-viewer-alpha.vercel.app/).

## Features

- **Editor** built on CodeMirror 6: LaTeX highlighting, command and environment autocomplete, bracket matching, search, and multi-cursor editing.
- **Live PDF preview** rendered with pdf.js. Recompiles keep your scroll position, text is selectable, and links are clickable.
- **Errors in place.** Compiler errors underline the failing line, open a Problems panel with the full log, and keep the last good PDF on screen.
- **Instant repeats.** Builds are cached by content in the browser and on the server, so undo, redo, and unchanged recompiles return immediately.
- **Text and Markdown views** extract clean output from the source for copying elsewhere. Markdown keeps math as `$...$` and `$$...$$`.
- **Command palette** (`Cmd+K` or `Ctrl+K`) for every action, plus `Cmd+S` to compile and `Cmd+O` to open a file.
- Resizable split, light and dark themes, a phone layout, and your work saved in this browser.

## Keyboard

| Action                | Shortcut                     |
| --------------------- | ---------------------------- |
| Command palette       | `Cmd+K` or `Cmd+Shift+P`     |
| Compile now           | `Cmd+S` or `Cmd+Enter`       |
| Open a .tex file      | `Cmd+O`                      |
| Find in source        | `Cmd+F`                      |
| Zoom the PDF          | `Ctrl` or `Cmd` + scroll     |

Use `Ctrl` in place of `Cmd` on Windows and Linux.

## Run locally

Requires Node.js 20.9 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. On macOS and Windows, `npm install` brings in a Tectonic binary for your platform through `node-latex-compiler`. You can also point `TECTONIC_PATH` at any Tectonic executable. The first compile downloads TeX packages and takes longer than the rest.

## Scripts

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Start the dev server               |
| `npm run build`     | Production build                   |
| `npm run start`     | Serve the production build         |
| `npm run lint`      | ESLint                             |
| `npm run typecheck` | TypeScript, no emit                |

## How it works

- `src/app/api/compile/route.ts` accepts `POST` with `{ "source": "..." }` (or a plain text body) and returns `application/pdf`. Failures return JSON with `error` and `log`.
- `src/lib/server/tectonic.ts` runs Tectonic in a temporary folder, removes it afterwards, and keeps a small in-memory cache of recent PDFs.
- `src/lib/server/shims.ts` rewrites a few Overleaf and pdfTeX conventions, such as `fontawesome5` and `glyphtounicode`, without shifting line numbers in error messages.
- Nothing is stored on the server. Your source is saved only in this browser's local storage.

## Deploy on Vercel

`vercel.json` sets the framework to Next.js and runs two scripts after `npm install`:

- `scripts/install-vercel-tectonic.mjs` downloads a static Linux Tectonic build into `vendor/bin`.
- `scripts/warm-tectonic-cache.mjs` compiles a few representative documents so the TeX packages and the LaTeX format file land in `node_modules/.cache/tectonic`. Vercel restores that folder between builds, so only the first build waits on the downloads.

`next.config.ts` includes the binary and the warmed cache in the compile function. On a cold start the function copies the cache into `/tmp`, so the first compile skips most downloads.

## License

MIT. Use it, fork it, and adapt it freely.
