import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { loadVideoReviewSource } from '../../workflows/video-review/source';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { ReviewAnnotation } from '../../features/video/review/types';

type Session = ReturnType<typeof createVideoReviewSession>;
export type LoadedReview = Awaited<ReturnType<typeof loadVideoReviewSource>> & {
  url: string;
  session: Session;
};

/** Owns the source URL and rejects late loads from a previously opened video. */
export function useLoadedReview(aggregateId: string) {
  const [resource, setResource] = useState<LoadedReview | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    setResource(null);
    setFailed(false);
    void loadVideoReviewSource(aggregateId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(loaded.file);
        setResource({ ...loaded, url, session: createVideoReviewSession(loaded.snapshot) });
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [aggregateId, attempt]);
  return { resource, failed, retry: () => setAttempt((value) => value + 1) };
}

/** React view of the serialized workflow snapshot. */
export function useReviewSnapshot(session: Session) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** Coalesces field recovery without making typing into document-history operations. */
export function useReviewComposer(session: Session) {
  const initial = session.getSnapshot().snapshot.draft;
  const [{ annotation, before, dirty, saving }, setField] = useState({
    annotation: initial?.annotation ?? (null as ReviewAnnotation | null),
    before: initial?.before ?? (null as ReviewAnnotation | null),
    dirty: false,
    saving: false,
  });
  const latest = useRef({ annotation, before, dirty: false, version: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstDirtyAt = useRef<number | null>(null);
  const draining = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);
  const committing = useRef(false);
  const flush = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (draining.current) return draining.current;
    const task = (async () => {
      if (mounted.current) setField((field) => ({ ...field, saving: true }));
      try {
        while (latest.current.dirty) {
          const captured = { ...latest.current };
          await session.saveDraft(captured.annotation, captured.before);
          if (latest.current.version === captured.version) {
            latest.current.dirty = false;
            firstDirtyAt.current = null;
            if (mounted.current) setField((field) => ({ ...field, dirty: false }));
          }
        }
      } finally {
        if (mounted.current) setField((field) => ({ ...field, saving: false }));
      }
    })();
    draining.current = task;
    void task
      .finally(() => {
        draining.current = null;
      })
      .catch(() => undefined);
    return task;
  }, [session]);
  const change = useCallback(
    (value: ReviewAnnotation | null, previous = latest.current.before) => {
      if (committing.current) return;
      latest.current = {
        annotation: value,
        before: previous,
        dirty: true,
        version: latest.current.version + 1,
      };
      setField((field) => ({ ...field, annotation: value, before: previous, dirty: true }));
      firstDirtyAt.current ??= Date.now();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => {
          void flush().catch(() => undefined);
        },
        Math.min(250, Math.max(0, 1000 - (Date.now() - firstDirtyAt.current)))
      );
    },
    [flush]
  );
  useRecoveryLifecycle(flush, mounted);
  const clearLocal = () => {
    latest.current = {
      annotation: null,
      before: null,
      dirty: false,
      version: latest.current.version + 1,
    };
    setField((field) => ({ ...field, annotation: null, before: null, dirty: false }));
  };
  const commitField = async (action: () => Promise<void>) => {
    if (committing.current) return;
    committing.current = true;
    try {
      await action();
    } finally {
      committing.current = false;
    }
  };
  return {
    annotation,
    before,
    dirty,
    saving,
    change,
    flush,
    save: () =>
      commitField(async () => {
        await flush();
        const captured = latest.current;
        if (!captured.annotation) return;
        if (JSON.stringify(captured.annotation) === JSON.stringify(captured.before)) {
          await session.saveDraft(null, null);
        } else
          await session.commit(
            {
              id: crypto.randomUUID(),
              at: Date.now(),
              target: 'annotation',
              before: captured.before,
              after: captured.annotation,
            },
            true
          );
        clearLocal();
      }),
    discard: () =>
      commitField(async () => {
        await flush();
        await session.saveDraft(null, null);
        clearLocal();
      }),
    reload: () =>
      commitField(async () => {
        if (timer.current) clearTimeout(timer.current);
        await draining.current?.catch(() => undefined);
        await session.reload();
        const draft = session.getSnapshot().snapshot.draft;
        latest.current = {
          annotation: draft?.annotation ?? null,
          before: draft?.before ?? null,
          dirty: false,
          version: latest.current.version + 1,
        };
        setField((field) => ({
          ...field,
          annotation: latest.current.annotation,
          before: latest.current.before,
          dirty: false,
        }));
      }),
  };
}

/** Browser visibility/unmount flushes share the same serialized recovery transaction. */
function useRecoveryLifecycle(flush: () => Promise<void>, mounted: RefObject<boolean>) {
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void flush().catch(() => undefined);
    };
  }, [flush, mounted]);
}
