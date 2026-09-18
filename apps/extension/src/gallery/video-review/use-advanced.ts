import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { useReviewSnapshot } from './use-session';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

const ADVANCED_SAVE_DEBOUNCE_MS = 250;

type PendingSave = { revision: number; value: QuickEditAdvancedState };

/**
 * Latest-write-wins autosave owner for the persisted advanced state. Commands compose
 * from the synchronous local revision, an acknowledged older write never clears a newer
 * pending one, and a failed write keeps the pending state available for Retry while
 * flush() rejects instead of pretending success.
 */
export function useReviewAdvanced(session: Session) {
  const snapshot = useReviewSnapshot(session);
  const persisted = snapshot.snapshot.workspace.advanced;
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
    if (mounted.current) {
      setOptimistic(null);
      setSaveFailed(false);
    }
  }, [session]);
  return {
    advanced: optimistic?.value ?? persisted,
    saveFailed,
    retry: flush,
    setMode: (mode: 'basic' | 'advanced') =>
      stage((current) => ({ ...current, ui: { ...current.ui, mode } })),
    setTrackVisibility: (track: 'actions' | 'zoom' | 'audio', visible: boolean) =>
      stage((current) => ({
        ...current,
        ui: { ...current.ui, tracks: { ...current.ui.tracks, [track]: visible } },
      })),
    setZoom: (update: (zoom: QuickEditAdvancedState['zoom']) => QuickEditAdvancedState['zoom']) =>
      stage((current) => ({ ...current, zoom: update(current.zoom) })),
    setBackground: (
      update: (
        background: QuickEditAdvancedState['background']
      ) => QuickEditAdvancedState['background']
    ) => stage((current) => ({ ...current, background: update(current.background) })),
    setAudio: (
      update: (audio: QuickEditAdvancedState['audio']) => QuickEditAdvancedState['audio']
    ) => stage((current) => ({ ...current, audio: update(current.audio) })),
    flush,
    reset,
  };
}
