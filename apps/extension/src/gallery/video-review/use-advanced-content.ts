import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  QuickEditAdvancedContent,
  QuickEditAdvancedState,
} from '../../features/video/review/advanced/types';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

const ADVANCED_SAVE_DEBOUNCE_MS = 250;
type ContentMutation = (content: QuickEditAdvancedContent) => QuickEditAdvancedContent;
type PendingContent = {
  revision: number;
  value: QuickEditAdvancedContent;
  mutations: ContentMutation[];
};

async function commitPendingContent(session: Session, sent: PendingContent): Promise<void> {
  const document = session.getSnapshot().document;
  if (JSON.stringify(sent.value) === JSON.stringify(document.advancedContent)) return;
  await session.commit({
    id: crypto.randomUUID(),
    at: Date.now(),
    target: 'advancedContent',
    before: document.advancedContent,
    after: sent.value,
  });
}

/** Rebases edits staged during an acknowledged write onto that acknowledged target. */
function pendingAfterAcknowledgement(
  current: PendingContent | null,
  sent: PendingContent
): PendingContent | null {
  if (!current || current.revision === sent.revision) return null;
  const mutations = current.mutations.slice(sent.mutations.length);
  const value = mutations.reduce((content, mutate) => mutate(content), sent.value);
  return { ...current, value, mutations };
}

/** Debounced advanced-content writer; every durable mutation is one history operation. */
export function useReviewAdvancedContent(
  session: Session,
  documentContent: QuickEditAdvancedContent
) {
  const [, setVersion] = useState(0);
  const [saveFailed, setSaveFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<PendingContent | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const nextRevision = useRef(0);
  const optimistic = useRef<PendingContent | null>(null);
  const mounted = useRef(true);
  const drain = useCallback(async (): Promise<void> => {
    while (pending.current) {
      const sent = pending.current;
      try {
        await commitPendingContent(session, sent);
      } catch (error) {
        if (mounted.current) setSaveFailed(true);
        throw error;
      }
      const acknowledged = pendingAfterAcknowledgement(pending.current, sent);
      pending.current = acknowledged;
      optimistic.current = acknowledged;
      if (mounted.current) {
        if (!acknowledged) setSaveFailed(false);
        setVersion((value) => value + 1);
      }
    }
  }, [session]);
  const flush = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const attempt = async () => {
      do {
        if (!running.current) {
          const task = drain().finally(() => {
            running.current = null;
          });
          running.current = task;
        }
        await running.current;
      } while (pending.current !== null);
    };
    return attempt();
  }, [drain]);
  const stage = useCallback(
    (mutate: ContentMutation) => {
      const previous = pending.current;
      const base = previous?.value ?? session.getSnapshot().document.advancedContent;
      const entry: PendingContent = {
        revision: ++nextRevision.current,
        value: mutate(base),
        mutations: [...(previous?.mutations ?? []), mutate],
      };
      optimistic.current = entry;
      pending.current = entry;
      setVersion((value) => value + 1);
      setSaveFailed(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush().catch(() => undefined);
      }, ADVANCED_SAVE_DEBOUNCE_MS);
    },
    [flush, session]
  );
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
  }, [flush]);
  useEffect(() => {
    if (!pending.current) optimistic.current = null;
    setVersion((value) => value + 1);
  }, [documentContent]);
  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    optimistic.current = null;
    if (mounted.current) {
      setSaveFailed(false);
      setVersion((value) => value + 1);
    }
  }, []);
  return {
    content: optimistic.current?.value ?? documentContent,
    saveFailed,
    pending: pending.current !== null,
    flush,
    reset,
    setZoom: (update: (zoom: QuickEditAdvancedState['zoom']) => QuickEditAdvancedState['zoom']) =>
      stage((content) => ({ ...content, zoom: update(content.zoom) })),
    setBackground: (
      update: (
        background: QuickEditAdvancedState['background']
      ) => QuickEditAdvancedState['background']
    ) => stage((content) => ({ ...content, background: update(content.background) })),
    setAudio: (
      update: (audio: QuickEditAdvancedState['audio']) => QuickEditAdvancedState['audio']
    ) => stage((content) => ({ ...content, audio: update(content.audio) })),
  };
}
