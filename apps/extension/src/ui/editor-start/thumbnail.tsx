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
  const [result, setResult] = useState<{ id: string; url: string | null } | null>(null);
  const owned = useRef<{ id: string; url: string } | null>(null);
  useEffect(
    () => () => {
      if (owned.current) URL.revokeObjectURL(owned.current.url);
      owned.current = null;
    },
    []
  );
  useEffect(() => {
    if (
      owned.current &&
      (owned.current.id !== item.id || !item.loadThumbnail || item.unavailable)
    ) {
      URL.revokeObjectURL(owned.current.url);
      owned.current = null;
    }
    if (!item.loadThumbnail || item.unavailable) {
      setResult(null);
      return;
    }
    const loadThumbnail = item.loadThumbnail;
    const controller = new AbortController();
    let started = false;
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const blob = await loadThumbnail(controller.signal);
        if (controller.signal.aborted || !blob) return;
        const next = { id: item.id, url: URL.createObjectURL(blob) };
        const previous = owned.current;
        owned.current = next;
        setResult(next);
        if (previous) URL.revokeObjectURL(previous.url);
      } catch {
        // A failed refresh retains the last usable preview of this identity.
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
    };
  }, [item]);
  const url = item.unavailable ? null : result?.id === item.id ? result.url : item.thumbnailUrl;
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
            if (owned.current?.url === url) {
              URL.revokeObjectURL(owned.current.url);
              owned.current = null;
            }
            setResult({ id: item.id, url: null });
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
