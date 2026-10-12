import { useRecoveryLifecycle } from './use-recovery-lifecycle';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { loadVideoReviewSource, VideoReviewLoadError } from '../../workflows/video-review/source';
import { createVideoReviewSession } from '../../workflows/video-review/session';
import type { ReviewAnnotation } from '../../features/video/review/types';

const logger = createLogger({ namespace: 'gallery:video-review' });

type Session = ReturnType<typeof createVideoReviewSession>;
export type LoadedReview = Awaited<ReturnType<typeof loadVideoReviewSource>> & {
  url: string;
  session: Session;
};

/** Owns the source URL and rejects late loads from a previously opened video. */
export function useLoadedReview(aggregateId: string) {
  const [resource, setResource] = useState<LoadedReview | null>(null);
  const [failed, setFailed] = useState<VideoReviewLoadError | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    let ownedSession: Session | null = null;
    setResource(null);
    setFailed(null);
    let loadedSource = false;
    void loadVideoReviewSource(aggregateId, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) return;
        loadedSource = true;
        const session = createVideoReviewSession(loaded.snapshot);
        ownedSession = session;
        url = URL.createObjectURL(loaded.file);
        setResource({ ...loaded, url, session });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure =
          error instanceof VideoReviewLoadError
            ? error
            : new VideoReviewLoadError(loadedSource ? 'session' : 'source', 'unknown');
        logger.error('video-review-open-failed', {
          stage: failure.stage,
          reason: failure.reason,
          ...(failure.diagnostic ? { validation: failure.diagnostic } : {}),
        });
        setFailed(failure);
      });
    return () => {
      controller.abort();
      if (ownedSession)
        void ownedSession
          .dispose()
          .catch(() => logger.warn('video-review-resource-cleanup-deferred'));
      if (url) URL.revokeObjectURL(url);
    };
  }, [aggregateId, attempt]);
  return { resource, failed, retry: () => setAttempt((value) => value + 1) };
}

/** React view of the serialized workflow snapshot. */
export function useReviewSnapshot(session: Session) {
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot
  );
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!session.getSnapshot().dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [session]);
  return snapshot;
}

function useComposerUnloadProtection(latest: RefObject<{ dirty: boolean }>) {
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!latest.current.dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [latest]);
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
  useComposerUnloadProtection(latest);
  const mounted = useRef(true);
  const committing = useRef<Promise<void> | null>(null);
  const [finishing, setFinishing] = useState(false);
  const flush = useCallback(async (): Promise<void> => {
    while (latest.current.dirty) await session.flushAutosave(['draft']);
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
      session.stageAutosave(
        'draft',
        () => {
          const captured = { ...latest.current };
          if (mounted.current) setField((field) => ({ ...field, saving: true }));
          return {
            change: { kind: 'draft', annotation: captured.annotation, before: captured.before },
            acknowledge: () => {
              if (latest.current.version === captured.version) latest.current.dirty = false;
              if (mounted.current)
                setField((field) => ({ ...field, dirty: latest.current.dirty, saving: false }));
            },
            fail: () => {
              if (mounted.current) setField((field) => ({ ...field, saving: false }));
            },
          };
        },
        { delay: 250, maxWait: 1000 }
      );
    },
    [session]
  );
  useRecoveryLifecycle(flush, mounted);
  const clearLocal = () => {
    session.cancelAutosave('draft');
    latest.current = {
      annotation: null,
      before: null,
      dirty: false,
      version: latest.current.version + 1,
    };
    setField((field) => ({ ...field, annotation: null, before: null, dirty: false }));
  };
  const commitField = (action: () => Promise<void>): Promise<void> => {
    if (committing.current) return committing.current;
    setFinishing(true);
    const task = action();
    committing.current = task;
    void task
      .finally(() => {
        committing.current = null;
        if (mounted.current) setFinishing(false);
      })
      .catch(() => undefined);
    return task;
  };
  const completion = createComposerCompletion({
    session,
    flush,
    getCurrent: () => latest.current,
    commitField,
    clearLocal,
  });
  return {
    annotation,
    before,
    dirty,
    saving,
    finishing,
    getCurrent: () => latest.current,
    change,
    flush,
    ...completion,
    reload: () =>
      commitField(async () => {
        session.cancelAutosave('draft');
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

/** Completion creates one annotation history step; recovery scheduling stays in the field owner. */
function createComposerCompletion(args: {
  session: Session;
  flush(): Promise<void>;
  getCurrent(): { annotation: ReviewAnnotation | null; before: ReviewAnnotation | null };
  commitField(action: () => Promise<void>): Promise<void>;
  clearLocal(): void;
}) {
  const save = () =>
    args.commitField(async () => {
      await args.flush();
      const captured = args.getCurrent();
      if (!captured.annotation) return;
      if (JSON.stringify(captured.annotation) === JSON.stringify(captured.before))
        await args.session.saveDraft(null, null);
      else
        await args.session.commit(
          {
            id: crypto.randomUUID(),
            at: Date.now(),
            target: 'annotation',
            before: captured.before,
            after: captured.annotation,
          },
          true
        );
      args.clearLocal();
    });
  const discard = () =>
    args.commitField(async () => {
      await args.flush();
      await args.session.saveDraft(null, null);
      args.clearLocal();
    });
  return {
    save,
    discard,
    finishNew: () => {
      const current = args.getCurrent();
      if (!current.annotation || current.before) return Promise.resolve();
      return current.annotation.text.trim() ? save() : discard();
    },
  };
}

/** Browser visibility/unmount flushes share the same serialized recovery transaction. */
