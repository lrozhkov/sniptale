import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorStartItem } from './index';

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
  thumbnail: (id: string) => Promise<Blob | undefined>
) {
  const [items, setItems] = useState<EditorStartItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const revision = useRef(0);
  const urls = useRef<string[]>([]);
  const refresh = useCallback(async () => {
    const turn = ++revision.current;
    setStatus('loading');
    const nextUrls: string[] = [];
    try {
      const source = sortEditorStartItems(await list());
      const visible = source;
      const next = await Promise.all(
        visible.map(async (item, index) => {
          const blob =
            index < 6 && item.thumbnailId
              ? await thumbnail(item.thumbnailId).catch(() => undefined)
              : undefined;
          const thumbnailUrl = blob ? URL.createObjectURL(blob) : null;
          if (thumbnailUrl) nextUrls.push(thumbnailUrl);
          return {
            id: item.id,
            title: item.title,
            detail: item.detail,
            ...(item.unavailable === undefined ? {} : { unavailable: item.unavailable }),
            thumbnailUrl,
          };
        })
      );
      if (turn !== revision.current) {
        nextUrls.forEach(URL.revokeObjectURL);
        return;
      }
      urls.current.forEach(URL.revokeObjectURL);
      urls.current = nextUrls;
      setItems(next);
      setStatus('ready');
    } catch {
      nextUrls.forEach(URL.revokeObjectURL);
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
      urls.current.forEach(URL.revokeObjectURL);
      urls.current = [];
    };
  }, [refresh]);
  return { items, status, refresh };
}
