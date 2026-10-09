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
  const [backgroundGesture, setBackgroundGesture] = useState<{
    session: Session;
    base: QuickEditAdvancedState['background'];
    value: QuickEditAdvancedState['background'];
  } | null>(null);
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
    setBackgroundGesture(null);
    if (mounted.current) {
      setOptimistic(null);
      setSaveFailed(false);
    }
  }, [contentState, session]);
  const content = contentState.content;
  const {
    actionsEnabled: _baselineActionsEnabled,
    keyAnimations: _baselineKeys,
    clickAnimations: _baselineClicks,
    canvas: _baselineCanvas,
    windowHeader: _baselineHeader,
    watermark: _baselineWatermark,
    presentation: _baselinePresentation,
    webcam: _baselineWebcam,
    text: _baselineText,
    captions: _baselineCaptions,
    ...workspaceState
  } = persisted;
  const advanced: QuickEditAdvancedState = {
    ...workspaceState,
    ui: optimistic?.value.ui ?? persisted.ui,
    ...content,
  };
  return {
    ...contentState.commands,
    advanced,
    backgroundPreview:
      backgroundGesture?.session === session && backgroundGesture.base === content.background
        ? backgroundGesture.value
        : null,
    previewBackground: (value: QuickEditAdvancedState['background'] | null) =>
      setBackgroundGesture(value ? { session, base: content.background, value } : null),
    saveFailed: saveFailed || contentState.saveFailed,
    pending: optimistic !== null || contentState.pending,
    retry: () => Promise.all([flush(), contentState.flush()]),
    ...reviewAdvancedUiCommands(stage, () => currentRef.current, contentState.commands),
    flush: async () => {
      await flush();
      await contentState.flush();
    },
    reset,
  };
}

/** Coordinates lane visibility with authored application without dropping stored settings. */
function reviewAdvancedUiCommands(
  stage: (update: (state: QuickEditAdvancedState) => QuickEditAdvancedState) => void,
  current: () => QuickEditAdvancedState,
  commands: ReturnType<typeof useReviewAdvancedContent>['commands']
) {
  return {
    setMode: (mode: 'basic' | 'advanced') => {
      const firstEntry =
        mode === 'advanced' &&
        current().ui.mode === 'basic' &&
        !current().ui.advancedTracksInitialized;
      if (firstEntry) commands.setZoom((zoom) => ({ ...zoom, enabled: true }));
      stage((current) => ({
        ...current,
        ui: {
          ...current.ui,
          mode,
          advancedTracksInitialized:
            current.ui.advancedTracksInitialized ||
            current.ui.mode === 'advanced' ||
            mode === 'advanced',
          tracks: firstEntry
            ? { ...current.ui.tracks, zoom: true, audio: true }
            : current.ui.tracks,
        },
      }));
    },
    setTrackVisibility: (track: 'actions' | 'zoom' | 'audio' | 'webcam', visible: boolean) => {
      if (track === 'actions' && current().ui.mode === 'advanced')
        commands.setActionsEnabled(visible);
      if (track === 'zoom') commands.setZoom((zoom) => ({ ...zoom, enabled: visible }));
      if (track === 'webcam')
        commands.setWebcam((camera) => (camera ? { ...camera, enabled: visible } : camera));
      stage((current) => ({
        ...current,
        ui: { ...current.ui, tracks: { ...current.ui.tracks, [track]: visible } },
      }));
    },
    setOverlaysVisible: (visible: boolean) =>
      stage((current) => ({ ...current, ui: { ...current.ui, overlaysVisible: visible } })),
  };
}
