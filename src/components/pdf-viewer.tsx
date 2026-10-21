"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask, TextLayer } from "pdfjs-dist";

type PdfJs = typeof import("pdfjs-dist");
type PageSize = { width: number; height: number };
type LoadedDocument = { doc: PDFDocumentProxy; task: PDFDocumentLoadingTask; sizes: PageSize[] };

const PAGE_GAP = 20;
const MAX_FIT_SCALE = 1.75;

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs() {
  pdfjsPromise ??= import("pdfjs-dist")
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
      return pdfjs;
    })
    .catch((error: unknown) => {
      pdfjsPromise = null;
      throw error;
    });
  return pdfjsPromise;
}

type PdfViewerProps = {
  data: ArrayBuffer | null;
  zoom: number;
  onZoomStep: (direction: 1 | -1) => void;
  onLoaded: (pages: number) => void;
  onError: (message: string) => void;
};

export const PdfViewer = memo(function PdfViewer({ data, zoom, onZoomStep, onLoaded, onError }: PdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onZoomStep, onLoaded, onError });
  const [loaded, setLoaded] = useState<LoadedDocument | null>(null);
  const [width, setWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollRatio = useRef(0);

  useEffect(() => {
    callbacks.current = { onZoomStep, onLoaded, onError };
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    let cancelled = false;
    let task: PDFDocumentLoadingTask | null = null;
    let settled = false;

    void (async () => {
      const pdfjs = await loadPdfJs();
      if (cancelled) {
        return;
      }
      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data.slice(0)) });
      task = loadingTask;
      const doc = await loadingTask.promise;
      const sizes = await Promise.all(
        Array.from({ length: doc.numPages }, async (_, index) => {
          const viewport = (await doc.getPage(index + 1)).getViewport({ scale: 1 });
          return { width: viewport.width, height: viewport.height };
        }),
      );
      settled = true;
      if (cancelled) {
        void loadingTask.destroy();
        return;
      }
      setLoaded({ doc, task: loadingTask, sizes });
      callbacks.current.onLoaded(doc.numPages);
    })().catch((error: unknown) => {
      if (!cancelled) {
        callbacks.current.onError(error instanceof Error ? error.message : "Could not open the PDF.");
      }
    });

    return () => {
      cancelled = true;
      if (!settled) {
        void task?.destroy();
      }
    };
  }, [data]);

  // A replaced document is released only after the next commit, once its pages stopped rendering.
  useEffect(() => {
    return () => {
      void loaded?.task.destroy();
    };
  }, [loaded]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    let timer = 0;
    let measured = false;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width);
      window.clearTimeout(timer);
      // Settle continuous resizes, such as dragging the split, before re-rendering pages.
      timer = window.setTimeout(() => setWidth(next), measured ? 90 : 0);
      measured = true;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    let accumulated = 0;
    let last = 0;
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      accumulated += event.deltaY;
      const now = performance.now();
      if (Math.abs(accumulated) < 24 || now - last < 90) {
        return;
      }
      callbacks.current.onZoomStep(accumulated < 0 ? 1 : -1);
      accumulated = 0;
      last = now;
    };

    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, []);

  const padding = width < 520 ? 12 : 28;
  const maxPageWidth = loaded ? Math.max(...loaded.sizes.map((size) => size.width)) : 612;
  const fitScale = width > 0 ? Math.min((width - padding * 2) / maxPageWidth, MAX_FIT_SCALE) : 1;
  // Round down so a fitted page never overflows its pane by a fraction of a pixel.
  const scale = Math.max(0.1, Math.floor(fitScale * zoom * 1000) / 1000);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTop = scrollRatio.current * element.scrollHeight;
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  }, [scale]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    let frame = 0;
    let idle = 0;
    const handleScroll = () => {
      scrollRatio.current = element.scrollHeight > 0 ? element.scrollTop / element.scrollHeight : 0;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const pages = pagesRef.current?.children;
        if (!pages) {
          return;
        }
        const probe = element.scrollTop + element.clientHeight * 0.4;
        let page = 1;
        for (let index = 0; index < pages.length; index += 1) {
          const node = pages[index] as HTMLElement;
          if (node.offsetTop <= probe) {
            page = index + 1;
          }
        }
        setCurrentPage(page);
      });
      setIsScrolling(true);
      window.clearTimeout(idle);
      idle = window.setTimeout(() => setIsScrolling(false), 900);
    };

    element.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", handleScroll);
      cancelAnimationFrame(frame);
      window.clearTimeout(idle);
    };
  }, []);

  const pageCount = loaded?.sizes.length ?? 0;

  return (
    <div className="pdf-viewer">
      <div className="pdf-scroll" ref={scrollRef}>
        {loaded ? (
          <div className="pdf-pages" ref={pagesRef} style={{ gap: PAGE_GAP, padding: `${padding}px` }}>
            {loaded.sizes.map((size, index) => (
              <PdfPage
                key={index}
                doc={loaded.doc}
                pageNumber={index + 1}
                scale={scale}
                width={size.width * scale}
                height={size.height * scale}
                rootRef={scrollRef}
              />
            ))}
          </div>
        ) : (
          <div className="pdf-pages" style={{ padding: `${padding}px` }}>
            <PageSkeleton width={612 * scale} height={792 * scale} />
          </div>
        )}
      </div>
      {pageCount > 1 ? (
        <div className={`page-indicator ${isScrolling ? "is-visible" : ""}`} aria-hidden="true">
          {currentPage} / {pageCount}
        </div>
      ) : null}
    </div>
  );
});

type PdfPageProps = {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  width: number;
  height: number;
  rootRef: RefObject<HTMLDivElement | null>;
};

const PdfPage = memo(function PdfPage({ doc, pageNumber, scale, width, height, rootRef }: PdfPageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const rendered = useRef<{ doc: PDFDocumentProxy; scale: number } | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: rootRef.current,
      rootMargin: "900px 0px",
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const box = boxRef.current;
    if (!visible || !box) {
      return;
    }
    if (rendered.current?.doc === doc && rendered.current.scale === scale) {
      return;
    }

    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;

    void (async () => {
      const [pdfjs, page] = await Promise.all([loadPdfJs(), doc.getPage(pageNumber)]);
      if (cancelled) {
        return;
      }

      const viewport = page.getViewport({ scale });
      const ratio = window.devicePixelRatio || 1;
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-canvas";
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);

      renderTask = page.render({
        canvas,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await renderTask.promise;
      if (cancelled) {
        return;
      }

      const textDiv = document.createElement("div");
      textDiv.className = "textLayer";
      textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
      const [, annotations] = await Promise.all([textLayer.render(), page.getAnnotations({ intent: "display" })]);
      if (cancelled) {
        return;
      }

      const linkLayer = document.createElement("div");
      linkLayer.className = "pdf-links";
      for (const annotation of annotations as Array<{ subtype?: string; url?: string; rect: number[] }>) {
        if (annotation.subtype !== "Link" || !annotation.url || !/^(https?:|mailto:|tel:)/i.test(annotation.url)) {
          continue;
        }
        const [x1, y1] = viewport.convertToViewportPoint(annotation.rect[0], annotation.rect[1]) as number[];
        const [x2, y2] = viewport.convertToViewportPoint(annotation.rect[2], annotation.rect[3]) as number[];
        const link = document.createElement("a");
        link.href = annotation.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.title = annotation.url;
        link.style.left = `${Math.min(x1, x2)}px`;
        link.style.top = `${Math.min(y1, y2)}px`;
        link.style.width = `${Math.abs(x2 - x1)}px`;
        link.style.height = `${Math.abs(y2 - y1)}px`;
        linkLayer.appendChild(link);
      }

      // Swap in one step so the previous build stays on screen until this one is ready.
      box.replaceChildren(canvas, textDiv, linkLayer);
      box.classList.add("is-rendered");
      rendered.current = { doc, scale };
    })().catch(() => {
      // Cancelled renders and destroyed documents reject; the next pass repaints the page.
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [visible, doc, scale, pageNumber]);

  return (
    <div
      className="pdf-page"
      ref={boxRef}
      style={{ width, height, ["--scale-factor" as string]: scale }}
      aria-label={`Page ${pageNumber}`}
      role="group"
    />
  );
});

function PageSkeleton({ width, height }: PageSize) {
  return (
    <div className="pdf-page pdf-skeleton" style={{ width, height }} aria-hidden="true">
      <span style={{ width: "46%", height: "3.2%", margin: "14% auto 0" }} />
      <span style={{ width: "28%", height: "1.6%", margin: "3% auto 0" }} />
      <span style={{ width: "22%", height: "1.6%", margin: "1.6% auto 8%" }} />
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index} style={{ width: index % 4 === 3 ? "52%" : "76%", height: "1.4%", margin: "2.2% 12% 0" }} />
      ))}
    </div>
  );
}
