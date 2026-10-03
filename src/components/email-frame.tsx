"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ImageOff } from "lucide-react";

// Mirrors globals.css: <html data-theme> wins, otherwise follow the OS.
const DARK_MQ = "(prefers-color-scheme: dark)";
function subscribeDark(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  const mq = window.matchMedia(DARK_MQ);
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}
function getIsDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === "dark" : window.matchMedia(DARK_MQ).matches;
}

const REMOTE_RE = /(<img[^>]+src\s*=\s*["']?\s*https?:)|(url\(\s*["']?\s*https?:)|(<link[^>]+href\s*=\s*["']?\s*https?:)/i;

const luminance = (rgb: string) => {
  const m = rgb.match(/[\d.]+/g);
  if (!m) return null;
  const [r, g, b] = m.slice(0, 3).map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

/**
 * Emails often hardcode text colors (e.g. #171717) that vanish on our dark frame, or the reverse.
 * When the email sets no backgrounds of its own, flip any inline text color that contrasts badly
 * with the frame. Emails with their own backgrounds are left untouched.
 */
function adaptColors(doc: Document, dark: boolean) {
  if (doc.querySelector("[bgcolor], [style*='background']")) return;
  const win = doc.defaultView;
  if (!win) return;
  doc.querySelectorAll<HTMLElement>("[style*='color'], font[color]").forEach((el) => {
    const lum = luminance(win.getComputedStyle(el).color);
    if (lum === null) return;
    if (dark && lum < 0.45) el.style.setProperty("color", lum < 0.25 ? "#fafafa" : "#a1a1aa", "important");
    else if (!dark && lum > 0.65) el.style.setProperty("color", "#0a0a0a", "important");
  });
}

/**
 * Renders untrusted email HTML in a sandboxed iframe: no scripts (sandbox has no
 * allow-scripts), links open in a new tab, and remote content (tracking pixels)
 * is blocked by CSP until you opt in.
 */
export function EmailFrame({ html, text }: { html: string | null; text: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [showRemote, setShowRemote] = useState(false);
  const [height, setHeight] = useState(200);
  const hasRemote = useMemo(() => !!html && REMOTE_RE.test(html), [html]);
  const dark = useSyncExternalStore(subscribeDark, getIsDark, () => false);

  const srcDoc = useMemo(() => {
    if (!html) return null;
    const [bg, fg] = dark ? ["#111111", "#fafafa"] : ["#ffffff", "#0a0a0a"];
    const remote = showRemote ? " https: http:" : "";
    const csp = `default-src 'none'; img-src data: cid:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; media-src data:${remote}`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>:root{color-scheme:${dark ? "dark" : "light"}}html,body{margin:0;background:${bg};color:${fg}}body{padding:16px;font:14px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}a{color:${dark ? "#93c5fd" : "#2563eb"}}img{max-width:100%;height:auto}table{max-width:100%}</style></head><body>${html}</body></html>`;
  }, [html, showRemote, dark]);

  useEffect(() => {
    const frame = ref.current;
    if (!frame || !srcDoc) return;
    let observer: ResizeObserver | undefined;
    const measure = () => {
      const doc = frame.contentDocument;
      if (!doc?.documentElement) return;
      adaptColors(doc, dark);
      setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 80), 6000));
      observer?.disconnect();
      observer = new ResizeObserver(() => setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 80), 6000)));
      observer.observe(doc.body);
    };
    frame.addEventListener("load", measure);
    if (frame.contentDocument?.readyState === "complete") measure();
    return () => {
      frame.removeEventListener("load", measure);
      observer?.disconnect();
    };
  }, [srcDoc, dark]);

  if (!srcDoc) {
    return <pre className="whitespace-pre-wrap break-words px-1 font-sans text-sm leading-relaxed">{text || "(empty message)"}</pre>;
  }

  return (
    <div>
      {hasRemote && !showRemote && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          <span className="inline-flex items-center gap-2">
            <ImageOff className="size-3.5" /> Remote images are blocked to stop tracking.
          </span>
          <button onClick={() => setShowRemote(true)} className="font-medium text-accent">
            Show images
          </button>
        </div>
      )}
      <iframe
        ref={ref}
        title="Email content"
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={srcDoc}
        style={{ height }}
        className="w-full rounded-lg border border-border bg-surface"
      />
    </div>
  );
}
