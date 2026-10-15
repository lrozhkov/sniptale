import { useEffect, useRef, useState } from 'react';
import { listMediaLibrary, getMediaThumbnail } from '../../composition/persistence/media-library';
import type { MediaLibraryItem } from '../../composition/persistence/media-library/contracts';
import {
  listGallerySavedViews,
  type GallerySavedView,
} from '../../composition/persistence/gallery-saved-views';
import { matchesLibraryFilters } from '../../features/media-hub/library-filters';

/** One cancellable listing attempt owns rows/views; filter choices remain caller-owned. */
export function usePresentationLibrary(
  kind: 'image' | 'video' | 'media',
  appliedQuery: string,
  viewId: string
) {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [views, setViews] = useState<GallerySavedView[]>([]);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void Promise.all([listMediaLibrary(), listGallerySavedViews()])
      .then(([rows, savedViews]) => {
        if (!active) return;
        setItems(
          rows.filter(
            (item) =>
              (kind === 'media'
                ? ['image', 'screenshot', 'video'].includes(item.kind)
                : kind === 'video'
                  ? item.kind === 'video'
                  : ['image', 'screenshot'].includes(item.kind)) &&
              item.lifecycle?.trashedAt === undefined
          )
        );
        setViews(
          savedViews.filter(
            (view) =>
              view.folderFilter === 'all' ||
              (view.folderFilter === 'screenshot' && kind !== 'video') ||
              (view.folderFilter === 'recording' && kind !== 'image')
          )
        );
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('failed');
      });
    return () => {
      active = false;
    };
  }, [attempt, kind]);
  const selected = viewId.startsWith('view:')
    ? views.find((view) => view.id === viewId.slice(5))
    : undefined;
  const activeViewId = selected
    ? viewId
    : viewId === 'section:image' && kind !== 'video'
      ? viewId
      : viewId === 'section:video' && kind !== 'image'
        ? viewId
        : 'section:all';
  const section =
    selected?.folderFilter === 'screenshot'
      ? 'image'
      : selected?.folderFilter === 'recording'
        ? 'video'
        : activeViewId === 'section:image'
          ? 'image'
          : activeViewId === 'section:video'
            ? 'video'
            : 'all';
  const visibleItems = items.filter(
    (item) =>
      (section === 'all' ||
        (section === 'video' ? item.kind === 'video' : item.kind !== 'video')) &&
      item.filename.toLocaleLowerCase().includes(appliedQuery.trim().toLocaleLowerCase()) &&
      (!selected || matchesLibraryFilters(item, selected.filters, Date.now()))
  );
  return {
    items,
    views,
    visibleItems,
    activeViewId,
    status,
    retry: () => setAttempt((value) => value + 1),
  };
}

/** Visible tiles hold one disposable thumbnail URL, released on replacement or unmount. */
export function usePresentationLibraryThumbnail(mediaId: string) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((item) => item.isIntersecting)) return;
      observer.disconnect();
      void (async () => {
        const thumbnail = await getMediaThumbnail(mediaId);
        const blob = thumbnail?.blob;
        if (!blob || !active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })().catch(() => undefined);
    });
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      active = false;
      observer.disconnect();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  return { anchor, url };
}
