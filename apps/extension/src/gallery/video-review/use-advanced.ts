import { useTrackControlRequests } from './use-track-control-requests';
import { useRecoveryLifecycle } from './use-recovery-lifecycle';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  QuickEditAdvancedState,
  QuickEditAdvancedContent,
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
export function useReviewAdvanced(session: Session, beforeEdit?: () => void) {
  const snapshot = useReviewSnapshot(session);
  const persisted = snapshot.snapshot.workspace.advanced;
  const contentState = useReviewAdvancedContent(
    session,
    snapshot.document.advancedContent,
    beforeEdit
  );
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
      beforeEdit?.();
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
    [session, beforeEdit]
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
  const previousAdvanced = useRef<{ session: Session; value: QuickEditAdvancedState } | null>(null);
  const advanced = useMemo<QuickEditAdvancedState>(() => {
    const next = composeReviewAdvanced(persisted, content, optimistic?.value.ui ?? persisted.ui);
    const previous =
      previousAdvanced.current?.session === session ? previousAdvanced.current.value : undefined;
    if (previous) {
      next.ui = retainReviewFields(previous.ui, next.ui);
      next.zoom = retainReviewFields(previous.zoom, next.zoom);
      next.audio = retainReviewFields(previous.audio, {
        ...next.audio,
        original: retainReviewFields(previous.audio.original, next.audio.original),
      });
      if (previous.annotationEffects && next.annotationEffects)
        next.annotationEffects = retainReviewFields(
          previous.annotationEffects,
          next.annotationEffects
        );
      if (previous.webcam && next.webcam)
        next.webcam = retainReviewFields(previous.webcam, next.webcam);
    }
    const value = previous ? retainReviewFields(previous, next) : next;
    previousAdvanced.current = { session, value };
    return value;
  }, [persisted, optimistic, content, session]);
  const readCurrentContent = contentState.readCurrent;
  const readCurrent = useCallback(
    () =>
      composeReviewAdvanced(
        session.getSnapshot().snapshot.workspace.advanced,
        readCurrentContent(),
        pending.current?.value.ui ?? session.getSnapshot().snapshot.workspace.advanced.ui
      ),
    [session, readCurrentContent]
  );
  return {
    ...contentState.commands,
    advanced,
    readCurrent,
    readCurrentContent,
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

function composeReviewAdvanced(
  persisted: QuickEditAdvancedState,
  content: QuickEditAdvancedContent,
  ui: QuickEditAdvancedState['ui']
): QuickEditAdvancedState {
  const {
    sourceFilters: _baselineSourceFilters,
    cursorFocusPath: _baselineCursorFocusPath,
    cursorMotions: _baselineCursorMotions,
    cursorMotionEnabled: _baselineCursorMotionEnabled,
    annotationEffects: _baselineAnnotationEffects,
    actionsEnabled: _baselineActionsEnabled,
    interactionTimeline: _baselineInteractionTimeline,
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
  return { ...workspaceState, ui, ...content };
}

/** Persistence parsing clones JSON branches; equal branches must not restart unrelated consumers. */
function retainReviewFields<T extends object>(previous: T, next: T): T {
  const fields = new Map<string, unknown>(Object.entries(previous));
  const entries = Object.entries(next);
  let equal = fields.size === entries.length;
  const result = { ...next };
  for (const [key, value] of entries) {
    const prior = fields.get(key);
    if (
      fields.has(key) &&
      (Object.is(prior, value) || JSON.stringify(prior) === JSON.stringify(value))
    )
      Reflect.set(result, key, prior);
    else equal = false;
  }
  return equal ? previous : result;
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
    setTimelinePreferences: (
      preferences: Partial<
        Pick<QuickEditAdvancedState['ui'], 'liveSeekEnabled' | 'annotationMagnetEnabled'>
      >
    ) => stage((current) => ({ ...current, ui: { ...current.ui, ...preferences } })),
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
