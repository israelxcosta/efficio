import { useCallback, useLayoutEffect, useState } from 'react';

export interface ElementSize {
  width: number;
  height: number;
}

function contentSize(el: HTMLElement): ElementSize {
  const css = getComputedStyle(el);
  const padX = (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.paddingRight) || 0);
  const padY = (parseFloat(css.paddingTop) || 0) + (parseFloat(css.paddingBottom) || 0);
  return { width: Math.max(0, Math.round(el.clientWidth - padX)), height: Math.max(0, Math.round(el.clientHeight - padY)) };
}

/**
 * Content-box size of an element, kept current with a ResizeObserver (one update per animation
 * frame). Pass `ref` as the element's ref: it is a callback ref, so elements that mount later
 * (after a skeleton) are measured too. Starts at 0×0 until the first measure.
 */
export function useElementSize<T extends HTMLElement = HTMLDivElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });
  const ref = useCallback((el: T | null) => setElement(el), []);

  useLayoutEffect(() => {
    if (!element) {
      setSize((prev) => (prev.width === 0 && prev.height === 0 ? prev : { width: 0, height: 0 }));
      return;
    }
    let frame = 0;
    const apply = (next: ElementSize) =>
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    apply(contentSize(element));
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply({ width: Math.round(rect.width), height: Math.round(rect.height) }));
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [element]);

  return { ref, element, width: size.width, height: size.height };
}
