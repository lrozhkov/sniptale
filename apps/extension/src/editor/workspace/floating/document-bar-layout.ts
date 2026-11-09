import { useEffect, useRef } from 'react';

/** Keeps the document caption inside the space before the drawing toolbar. */
export function useDocumentBarLayout(enabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = root.current;
    const tools = document.querySelector<HTMLElement>('[data-ui="editor.floating.tool-rail"]');
    if (!enabled || !bar || !tools) return;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      if (bar.querySelector('input')) return;
      const title = bar.querySelector<HTMLElement>(
        '[data-ui="editor.floating.document-bar.title"]'
      )?.parentElement;
      if (!title) return;
      const bounds = bar.getBoundingClientRect();
      const fixedWidth = bounds.width - title.getBoundingClientRect().width;
      const freeWidth = tools.getBoundingClientRect().left - bounds.left - fixedWidth - 8;
      const available = `${Math.max(0, Math.floor(freeWidth))}px`;
      if (bar.style.getPropertyValue('--editor-title-available') !== available)
        bar.style.setProperty('--editor-title-available', available);
    };
    const request = () => {
      if (frame === null) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(request);
    observer.observe(bar);
    observer.observe(tools);
    window.addEventListener('resize', request);
    request();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', request);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [enabled]);
  return root;
}
