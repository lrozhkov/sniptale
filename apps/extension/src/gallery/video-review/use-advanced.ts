import { useRecoveryLifecycle } from './use-recovery-lifecycle';
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
  const nextRevision = useRef(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    if (!optimistic) currentRef.current = persisted;
  }, [persisted, optimistic]);
  const flush = useCallback(async (): Promise<void> => {
    while (pending.current) await session.flushAutosave(['advanced']);
  }, [session]);
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
      const epoch = generation.current;
      session.stageAutosave(
        'advanced',
        () => {
          const sent = pending.current;
          if (!sent) throw new Error('Review UI buffer is unavailable.');
          return {
            change: { kind: 'advanced', advanced: sent.value },
            acknowledge: () => {
              if (epoch !== generation.current || pending.current?.revision !== sent.revision)
                return;
              pending.current = null;
              if (mounted.current) {
                setSaveFailed(false);
                setOptimistic(null);
              }
            },
            fail: () => {
              if (epoch === generation.current && mounted.current) setSaveFailed(true);
            },
          };
        },
        { delay: ADVANCED_SAVE_DEBOUNCE_MS }
      );
    },
    [session]
  );
  useRecoveryLifecycle(flush, mounted);
  const reset = useCallback(() => {
    generation.current += 1;
    session.cancelAutosave('advanced');
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
    annotationEffects: _baselineAnnotationEffects,
    actionsEnabled: _baselineActionsEnabled,
    keyAnimations: _baselineKeys,
    clickAnimations: _baselineClicks,
    actionAudio: _baselineActionAudio,
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
    endTyping: contentState.endTyping,
    retry: () => Promise.all([flush(), contentState.flush()]),
    ...reviewAdvancedUiCommands(stage, () => currentRef.current, contentState.commands),
    flush: async () => {
      contentState.endTyping();
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
