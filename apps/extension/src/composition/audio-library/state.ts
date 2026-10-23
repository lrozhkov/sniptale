import { useEffect, useRef, useState } from 'react';
import { listMediaLibrary } from '../persistence/media-library';
import type { MediaLibraryItem } from '../persistence/media-library/contracts';
import { listGallerySavedViews, type GallerySavedView } from '../persistence/gallery-saved-views';
import { matchesLibraryFilters } from '../../features/media-hub/library-filters';

/** Disposable picker state; browsing never loads or decodes audio bytes. */
export function useAudioLibraryState() {
  const [items, setItems] = useState<MediaLibraryItem[]>([]);
  const [views, setViews] = useState<GallerySavedView[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const [viewId, setViewId] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [composing, setComposing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    void Promise.all([listMediaLibrary(), listGallerySavedViews()]).then(
      ([media, saved]) => {
        if (!active) return;
        setItems(
          media.filter((item) => item.kind === 'audio' && item.lifecycle?.trashedAt === undefined)
        );
        setViews(
          saved.filter((view) => view.folderFilter === 'audio' || view.folderFilter === 'all')
        );
        setStatus('ready');
      },
      () => {
        if (active) setStatus('failed');
      }
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (composing) return;
    timer.current = setTimeout(() => setAppliedQuery(query), 250);
    return () => clearTimeout(timer.current);
  }, [query, composing]);
  const selected = views.find((view) => view.id === viewId);
  const needle = appliedQuery.trim().toLocaleLowerCase();
  const visible = items.filter(
    (item) =>
      item.filename.toLocaleLowerCase().includes(needle) &&
      (!selected || matchesLibraryFilters(item, selected.filters, Date.now()))
  );
  return {
    status,
    views,
    viewId,
    setViewId,
    query,
    setQuery,
    setComposing,
    visible,
    retry: () => setAttempt((value) => value + 1),
    applyQuery: () => {
      if (composing) return;
      clearTimeout(timer.current);
      setAppliedQuery(query);
    },
  };
}
