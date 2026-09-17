import { useCallback, useEffect, useRef, useState } from 'react';
import type { QuickEditAdvancedState } from '../../features/video/review/advanced/types';
import { useReviewSnapshot } from './use-session';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

const ADVANCED_SAVE_DEBOUNCE_MS = 250;

/**
 * Debounced autosave for the persisted advanced state; the optimistic local value
 * renders immediately while the serialized queue writes through the revisioned store.
 */
export function useReviewAdvanced(session: Session) {
  const snapshot = useReviewSnapshot(session);
  const persisted = snapshot.snapshot.workspace.advanced;
  const [pending, setPending] = useState<QuickEditAdvancedState | null>(null);
  const latest = useRef<QuickEditAdvancedState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const flush = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const value = latest.current;
    if (!value) return Promise.resolve();
    latest.current = null;
    return session.saveAdvanced(value).then(
      () => {
        if (mounted.current) setPending(null);
      },
      () => undefined
    );
  }, [session]);
  const schedule = useCallback(
    (next: QuickEditAdvancedState) => {
      latest.current = structuredClone(next);
      setPending(latest.current);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void flush();
      }, ADVANCED_SAVE_DEBOUNCE_MS);
    },
    [flush]
  );
  useEffect(() => {
    mounted.current = true;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onVisibility);
      void flush();
    };
  }, [flush]);
  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    latest.current = null;
    if (mounted.current) setPending(null);
  }, []);
  const current = pending ?? persisted;
  return {
    advanced: current,
    setMode: (mode: 'basic' | 'advanced') => schedule({ ...current, ui: { ...current.ui, mode } }),
    setTrackVisibility: (track: 'actions' | 'zoom' | 'audio', visible: boolean) =>
      schedule({
        ...current,
        ui: { ...current.ui, tracks: { ...current.ui.tracks, [track]: visible } },
      }),
    setZoom: (update: (zoom: QuickEditAdvancedState['zoom']) => QuickEditAdvancedState['zoom']) =>
      schedule({ ...current, zoom: update(current.zoom) }),
    setBackground: (
      update: (
        background: QuickEditAdvancedState['background']
      ) => QuickEditAdvancedState['background']
    ) => schedule({ ...current, background: update(current.background) }),
    flush,
    reset,
  };
}
