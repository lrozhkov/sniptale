import { useTrackControlRequests } from './use-track-control-requests';
import { useRecoveryLifecycle } from './use-recovery-lifecycle';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditTrack,
} from '../../features/video/review/advanced/types';
import { useReviewAdvancedContent } from './use-advanced-content';
import { useReviewSnapshot } from './use-session';

type Session = ReturnType<
  typeof import('../../workflows/video-review/session').createVideoReviewSession
>;

import { EDITOR_AUTOSAVE_POLICY } from '../../features/autosave/policy';
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
        EDITOR_AUTOSAVE_POLICY
      );
    },
    [session]
  );
  const controls = useTrackControlRequests({
    prepare: async () => {
      contentState.endTyping();
      await contentState.flush();
      await flush();
    },
    execute: async (...request) => {
      await session.setTrackControl(...request);
      currentRef.current = session.getSnapshot().snapshot.workspace.advanced;
    },
    mounted,
  });
  useRecoveryLifecycle(flush, mounted);
  const reset = useCallback(() => {
    generation.current += 1;
    controls.reset();
    session.cancelAutosave('advanced');
    pending.current = null;
    currentRef.current = session.getSnapshot().snapshot.workspace.advanced;
    contentState.reset();
    setBackgroundGesture(null);
    if (mounted.current) {
      setOptimistic(null);
      setSaveFailed(false);
    }
  }, [contentState, controls, session]);
  const content = contentState.content;
  const advanced = useMemo<QuickEditAdvancedState>(() => {
    const {
      cursorFocusPath: _baselineCursorFocusPath,
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
    return {
      ...workspaceState,
      ui: optimistic?.value.ui ?? persisted.ui,
      ...content,
    };
  }, [persisted, optimistic, content]);
  return {
    ...contentState.commands,
    advanced,
    backgroundPreview:
      backgroundGesture?.session === session && backgroundGesture.base === content.background
        ? backgroundGesture.value
        : null,
    previewBackground: (value: QuickEditAdvancedState['background'] | null) =>
      setBackgroundGesture(value ? { session, base: content.background, value } : null),
    saveFailed: saveFailed || contentState.saveFailed || controls.failed,
    pending: optimistic !== null || contentState.pending || controls.pending,
    endTyping: contentState.endTyping,
    retry: async () => {
      if (controls.failed) await controls.retry();
      else await Promise.all([flush(), contentState.flush()]);
    },
    ...reviewAdvancedUiCommands(stage, () => currentRef.current, contentState.commands),
    setTrackVisibility: (track: Exclude<QuickEditTrack, 'source'> | 'audio', enabled: boolean) =>
      controls.change(track, { enabled }),
    flush: async () => {
      await controls.drain();
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
          ...(current.ui.modeSelectionPending === undefined ? {} : { modeSelectionPending: false }),
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
    setWorkspaceColor: (theme: 'light' | 'dark', color: string | null) =>
      stage((current) => {
        const workspaceColors = { ...current.ui.workspaceColors };
        if (color === null) delete workspaceColors[theme];
        else workspaceColors[theme] = color;
        return { ...current, ui: { ...current.ui, workspaceColors } };
      }),
    setOverlaysVisible: (visible: boolean) =>
      stage((current) => ({ ...current, ui: { ...current.ui, overlaysVisible: visible } })),
  };
}
