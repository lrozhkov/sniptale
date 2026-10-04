import { useCallback, useEffect, useRef, useState } from 'react';
export interface EditorStartItem {
  id: string;
  title: string;
  detail: string;
  thumbnailUrl?: string | null;
  loadThumbnail?: (signal: AbortSignal) => Promise<Blob | undefined>;
  unavailable?: boolean;
}

export interface EditorStartSourceItem extends Omit<EditorStartItem, 'thumbnailUrl'> {
  updatedAt: number;
  thumbnailId?: string | null;
}

export function sortEditorStartItems(items: EditorStartSourceItem[]): EditorStartSourceItem[] {
  return items.toSorted((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

/** Owns only disposable read state; the caller supplies storage access and compatibility policy. */
export function useEditorStartItems(
  list: () => Promise<EditorStartSourceItem[]>,
  thumbnail?: (id: string, signal?: AbortSignal) => Promise<Blob | undefined>
) {
  const [items, setItems] = useState<EditorStartItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const turn = ++revision.current;
    setStatus('loading');
    try {
      const source = sortEditorStartItems(await list());
      if (turn !== revision.current) return;
      setItems(
        source.map((item) => {
          const id = item.thumbnailId;
          return {
            id: item.id,
            title: item.title,
            detail: item.detail,
            ...(item.unavailable === undefined ? {} : { unavailable: item.unavailable }),
            ...(item.loadThumbnail
              ? { loadThumbnail: item.loadThumbnail }
              : id && thumbnail
                ? { loadThumbnail: (signal: AbortSignal) => thumbnail(id, signal) }
                : {}),
          };
        })
      );
      setStatus('ready');
    } catch {
      if (turn === revision.current) setStatus('error');
    }
  }, [list, thumbnail]);
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      revision.current += 1;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  return { items, status, refresh };
}
