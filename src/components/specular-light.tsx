"use client";

import { useEffect } from "react";

const PROXIMITY = 140; // px from the button edge where the light starts to appear

/**
 * One pointer listener for every `.specular` element on the page: points each
 * button's rim highlight toward the cursor and fades it in with proximity.
 * rAF-throttled and only touches buttons near the pointer, so it stays cheap.
 */
export function SpecularLight() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return; // touch: no hover light
    let raf = 0;
    let x = -1e4;
    let y = -1e4;
    const lit = new Set<HTMLElement>();

    const frame = () => {
      raf = 0;
      const next = new Set<HTMLElement>();
      document.querySelectorAll<HTMLElement>(".specular").forEach((el) => {
        const r = el.getBoundingClientRect();
        const dx = Math.max(r.left - x, 0, x - r.right);
        const dy = Math.max(r.top - y, 0, y - r.bottom);
        const dist = Math.hypot(dx, dy);
        if (dist > PROXIMITY) return;
        const t = 1 - dist / PROXIMITY;
        const bright = t * t * (3 - 2 * t);
        // CSS conic angle: 0deg = up, clockwise.
        const angle = (Math.atan2(x - (r.left + r.width / 2), -(y - (r.top + r.height / 2))) * 180) / Math.PI;
        el.style.setProperty("--sb-angle", `${angle.toFixed(1)}deg`);
        el.style.setProperty("--sb-bright", bright.toFixed(3));
        el.style.setProperty("--sb-x", `${(x - r.left).toFixed(0)}px`);
        el.style.setProperty("--sb-y", `${(y - r.top).toFixed(0)}px`);
        next.add(el);
      });
      // Fade out buttons the pointer moved away from.
      lit.forEach((el) => {
        if (!next.has(el)) el.style.setProperty("--sb-bright", "0");
      });
      lit.clear();
      next.forEach((el) => lit.add(el));
    };

    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      schedule();
    };
    const onLeave = () => {
      x = y = -1e4;
      schedule();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", schedule, { capture: true });
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return null;
}
