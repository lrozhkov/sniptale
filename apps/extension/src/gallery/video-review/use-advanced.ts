import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { useReviewAdvancedContent } from './use-advanced-content';
import { useReviewSnapshot } from './use-session';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

const ADVANCED_SAVE_DEBOUNCE_MS = 250;
type PendingSave = { revision: number; value: QuickEditAdvancedState };

/** UI chrome autosave remains outside user history; rendered content uses the history owner. */
export function useReviewAdvanced(session: Session) {
  const snapshot = useReviewSnapshot(session);
  const persisted = snapshot.snapshot.workspace.advanced;
  const contentState = useReviewAdvancedContent(session, snapshot.document.advancedContent);
  const [optimistic, setOptimistic] = useState<PendingSave | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const currentRef = useRef(persisted);
  const pending = useRef<PendingSave | null>(null);
  const running = useRef<Promise<void> | null>(null);
  const nextRevision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    if (!optimistic) currentRef.current = persisted;
  }, [persisted, optimistic]);
  const drain = useCallback(async (): Promise<void> => {
    while (pending.current) {
      const sent = pending.current;
      try {
        await session.saveAdvanced(sent.value);
      } catch (error) {
        if (mounted.current) setSaveFailed(true);
        throw error;
      }
      if (pending.current?.revision === sent.revision) {
        pending.current = null;
        if (mounted.current) {
          setSaveFailed(false);
          setOptimistic(null);
        }
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
    (update: (current: QuickEditAdvancedState) => QuickEditAdvancedState) => {
      const next = update(currentRef.current);
      currentRef.current = next;
      const entry: PendingSave = {
        revision: ++nextRevision.current,
        value: structuredClone(next),
      };
      pending.current = entry;
      setOptimistic(entry);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        void flush().catch(() => undefined);
      }, ADVANCED_SAVE_DEBOUNCE_MS);
    },
    [flush]
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
  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    currentRef.current = session.getSnapshot().snapshot.workspace.advanced;
    contentState.reset();
    if (mounted.current) {
      setOptimistic(null);
      setSaveFailed(false);
    }
  }, [contentState, session]);
  const content = contentState.content;
  const advanced: QuickEditAdvancedState = {
    ...persisted,
    ui: optimistic?.value.ui ?? persisted.ui,
    zoom: content.zoom,
    background: content.background,
    audio: content.audio,
  };
  return {
    advanced,
    saveFailed: saveFailed || contentState.saveFailed,
    pending: optimistic !== null || contentState.pending,
    retry: () => Promise.all([flush(), contentState.flush()]),
    setMode: (mode: 'basic' | 'advanced') =>
      stage((current) => ({ ...current, ui: { ...current.ui, mode } })),
    setTrackVisibility: (track: 'actions' | 'zoom' | 'audio', visible: boolean) =>
      stage((current) => ({
        ...current,
        ui: { ...current.ui, tracks: { ...current.ui.tracks, [track]: visible } },
      })),
    setOverlaysVisible: (visible: boolean) =>
      stage((current) => ({ ...current, ui: { ...current.ui, overlaysVisible: visible } })),
    setZoom: contentState.setZoom,
    setBackground: contentState.setBackground,
    setAudio: contentState.setAudio,
    flush: async () => {
      await flush();
      await contentState.flush();
    },
    reset,
  };
}
