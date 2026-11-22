import { useEffect, useRef, useState } from 'react';
import {
  createBrowserReviewTextTemplateStorage,
  type SavedReviewTextTemplate,
} from '../../composition/persistence/annotation-text-templates/storage';

type Storage = ReturnType<typeof createBrowserReviewTextTemplateStorage>;

/** Observes and mutates the browser profile catalog through its persistence owner. */
export function useReviewTextTemplateCatalog() {
  const [storage] = useState(createBrowserReviewTextTemplateStorage);
  const [catalog, setCatalog] = useState<{
    records: SavedReviewTextTemplate[];
    deletionRevision: string | null;
  }>({
    records: [],
    deletionRevision: null,
  });
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const generation = useRef(0);
  const refresh = useRef<() => Promise<void>>(async () => undefined);
  useEffect(() => {
    refresh.current = async () => {
      const request = ++generation.current;
      try {
        const catalog = await storage.load();
        if (request !== generation.current) return;
        setCatalog(catalog);
        setStatus('ready');
      } catch {
        if (request !== generation.current) return;
        setCatalog({ records: [], deletionRevision: null });
        setStatus('unavailable');
      }
    };
    const unsubscribe = storage.subscribe(() => void refresh.current());
    void refresh.current();
    return () => {
      generation.current += 1;
      refresh.current = async () => undefined;
      unsubscribe();
    };
  }, [storage]);
  return {
    ...catalog,
    status,
    reload: () => refresh.current(),
    async change(command: Parameters<Storage['change']>[0]) {
      const accepted = await storage.change(command).catch(() => false);
      await refresh.current();
      return accepted;
    },
  };
}
