import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { EditorStartItem } from './use-items';

/** One visible card owns its disposable preview request and object URL. */
export function EditorStartThumbnail({
  item,
  fallback,
}: {
  item: EditorStartItem;
  fallback: ReactNode;
}) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [result, setResult] = useState<{ item: EditorStartItem; url: string | null } | null>(null);
  useEffect(() => {
    if (!item.loadThumbnail || item.unavailable) return;
    const loadThumbnail = item.loadThumbnail;
    const controller = new AbortController();
    let url: string | null = null;
    let started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await loadThumbnail(controller.signal);
        if (controller.signal.aborted) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setResult({ item, url });
      } catch {
        if (!controller.signal.aborted) setResult({ item, url: null });
      }
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                observer?.disconnect();
                void load();
              }
            },
            { rootMargin: '160px' }
          );
    if (observer && anchor.current) observer.observe(anchor.current);
    else void load();
    return () => {
      controller.abort();
      observer?.disconnect();
      if (url) URL.revokeObjectURL(url);
    };
  }, [item]);
  const url = result?.item === item ? result.url : item.thumbnailUrl;
  return (
    <span
      ref={anchor}
      className="grid aspect-video place-items-center overflow-hidden bg-[var(--sniptale-color-surface-canvas)]"
    >
      {url ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-contain"
          onError={() => {
            if (result?.item === item && result.url) URL.revokeObjectURL(result.url);
            setResult({ item, url: null });
          }}
        />
      ) : (
        <span className="text-[var(--sniptale-color-text-muted)]" aria-hidden="true">
          {fallback}
        </span>
      )}
    </span>
  );
}
