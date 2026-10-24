import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { QuickPreviewPreferences } from '../../features/video/preview/quick-preferences';
import type { QuickEditWebcamPlacement } from '../../features/video/review/advanced/webcam';
import { useReviewCutTransitionProvider } from './cut-transition-preview';
import type { ReviewWebcamManualBinding } from './webcam-overlay';
import { createManualPresentationOwner } from './preview-presentation-session';
import {
  resolvePresentationDescription,
  type PresentationInput,
  type ReviewPreviewPresentationStatus,
  type PresentationCameraState,
  type Prepared,
} from './preview-presentation-state';

export type ReviewPreviewPresentationInput = PresentationInput;
type Owner = ReturnType<typeof createManualPresentationOwner>;
const inactiveStatus: ReviewPreviewPresentationStatus = {
  phase: 'inactive',
  actualRaster: null,
  presentedFPS: null,
  nativeVideoFPS: null,
};

/** Current stays hybrid; detailed pause retains one manual owner throughout a gesture. */
export function isReviewPreviewManual(preferences: QuickPreviewPreferences, playing: boolean) {
  return (
    preferences.rasterPreset !== 'current' ||
    preferences.frameRate !== 'current' ||
    (!playing && preferences.pausedQuality === 'detailed')
  );
}

/** Owns the complete manual raster and its providers; it never mutates the native transport. */
export function useReviewPreviewPresentation(input: ReviewPreviewPresentationInput) {
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden');
  const [comments, setComments] = useState<Record<string, { x: number; y: number }>>({});
  const [placement, setPlacement] = useState<QuickEditWebcamPlacement | null>(null);
  const [reported, setReported] = useState({ key: '', status: inactiveStatus });
  const [bounds, setBounds] = useState<Prepared['watermarkBounds'] | null>(null);
  const [camera, setCamera] = useState<PresentationCameraState>({
    phase: 'loading',
    duration: 0,
    ready: false,
  });
  const interacting = input.interacting || placement !== null || Object.keys(comments).length > 0;
  // A raw-source dissolve cannot represent two independently decorated camera poses.
  const manual =
    isReviewPreviewManual(input.preferences, input.playing) ||
    !!(
      input.scene.webcam?.enabled &&
      (input.scene.webcam.split || input.scene.webcam.positions.some((position) => position.split))
    ) ||
    (!!input.scene.annotationEffects?.lane.enabled &&
      input.scene.annotationEffects.lane.instances.some((instance) => instance.enabled)) ||
    !!input.scene.captions?.settings?.enabled ||
    !!input.cut?.edits.some((edit) => edit.kind === 'cut' && edit.transition?.type === 'dissolve');
  const active = manual && input.visible !== false && pageVisible;
  const retained =
    (manual || input.preferences.pausedQuality === 'detailed') &&
    input.visible !== false &&
    pageVisible;
  const lifetimeKey = JSON.stringify([
    retained,
    input.sourceIdentity,
    input.webcam?.settings.assetId,
    input.webcam?.editor.resourceAttempt,
  ]);
  const lifetime = useRef<ReturnType<typeof createPresentationSlot> | null>(null);
  if (lifetime.current?.key !== lifetimeKey) lifetime.current = createPresentationSlot(lifetimeKey);
  const owner = lifetime.current;
  const status = reported.key === lifetimeKey ? reported.status : inactiveStatus;
  const cut = useReviewCutTransitionProvider(active ? input.cut : undefined, true, owner.admit);
  const latest = useRef({ input, cut, placement });
  latest.current = { input, cut, placement };
  const onCommentPreview = useCallback((id: string, position: { x: number; y: number } | null) => {
    setComments((current) => {
      const next = { ...current };
      if (position) next[id] = position;
      else delete next[id];
      return next;
    });
  }, []);
  const onWebcamPreview = useCallback(
    (value: QuickEditWebcamPlacement | null) => setPlacement(value),
    []
  );
  useEffect(() => {
    const change = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, []);
  useLayoutEffect(() => {
    setCamera({ phase: 'loading', duration: 0, ready: false });
    setBounds(null);
    setReported({ key: owner.key, status: inactiveStatus });
    latest.current.input.onStatistics?.(inactiveStatus);
    return () => {
      owner.current?.dispose();
      owner.current = null;
    };
  }, [owner]);
  const reportNative = useCallback(
    (value: ReviewPreviewPresentationStatus) => {
      setReported({ key: owner.key, status: value });
      latest.current.input.onStatistics?.(value);
    },
    [owner]
  );
  useNativePreviewCadence(
    input.video,
    input.sourceIdentity,
    !manual &&
      input.visible !== false &&
      pageVisible &&
      input.playing &&
      input.preferences.showFrameRate,
    reportNative
  );
  const stable = useRef<ReturnType<typeof resolvePresentationDescription> | null>(null);
  stable.current = resolvePresentationDescription(
    input,
    comments,
    placement,
    !!interacting,
    stable.current
  );
  const key = stable.current.key;
  useLayoutEffect(() => {
    const current = stable.current!;
    if (active && !owner.current) {
      owner.current = createManualPresentationOwner(
        () => latest.current,
        (value) => {
          setReported({ key: owner.key, status: value });
          latest.current.input.onStatistics?.(value);
        },
        setBounds,
        setCamera
      );
    }
    owner.current?.update(current.description, current.generation, !!interacting, active);
  }, [active, owner, key, interacting]);
  useEffect(() => {
    owner.current?.ready();
  }, [owner, cut.current, camera.ready, camera.phase]);
  const retryCut = cut.retry;
  const retry = useCallback(() => {
    retryCut();
    if (camera.phase === 'failed') void latest.current.input.webcam?.editor.retry();
    else owner.current?.retry();
  }, [retryCut, owner, camera.phase]);
  const webcamManual: ReviewWebcamManualBinding = {
    ...camera,
    onPreviewPlacement: onWebcamPreview,
  };
  return {
    active: manual,
    status,
    retry,
    onCommentPreview,
    onWebcamPreview,
    webcamManual,
    watermarkManual: { bounds },
  };
}

/** Each mounted source/camera lifetime gets its own endpoint reservation receiver. */
function createPresentationSlot(key: string) {
  const slot = {
    key,
    current: null as Owner | null,
    admit(bytes: readonly [number, number]) {
      if (!slot.current) throw new Error('Preview endpoint owner unavailable');
      return slot.current.retainEndpoints(bytes);
    },
  };
  return slot;
}

/** Native readout has no compositor or managed raster lifetime. */
function useNativePreviewCadence(
  video: RefObject<HTMLVideoElement | null>,
  sourceIdentity: string,
  enabled: boolean,
  report: (value: ReviewPreviewPresentationStatus) => void
) {
  useEffect(() => {
    const node = video.current;
    if (!enabled || !node?.requestVideoFrameCallback) return;
    let disposed = false;
    let callback = 0;
    let start: { time: number; frames: number } | null = null;
    const reset = () => {
      start = null;
      report(inactiveStatus);
    };
    reset();
    node.addEventListener('seeking', reset);
    const observe: VideoFrameRequestCallback = (_now, metadata) => {
      if (disposed) return;
      if (node.seeking) {
        reset();
        callback = node.requestVideoFrameCallback(observe);
        return;
      }
      if (!start) start = { time: metadata.expectedDisplayTime, frames: metadata.presentedFrames };
      const elapsed = metadata.expectedDisplayTime - start.time;
      if (elapsed >= 500) {
        const nativeVideoFPS = ((metadata.presentedFrames - start.frames) * 1000) / elapsed;
        const next: ReviewPreviewPresentationStatus = {
          phase: 'inactive',
          actualRaster: null,
          presentedFPS: null,
          nativeVideoFPS,
        };
        report(next);
        start = { time: metadata.expectedDisplayTime, frames: metadata.presentedFrames };
      }
      callback = node.requestVideoFrameCallback(observe);
    };
    callback = node.requestVideoFrameCallback(observe);
    return () => {
      disposed = true;
      node.cancelVideoFrameCallback(callback);
      node.removeEventListener('seeking', reset);
      report(inactiveStatus);
    };
  }, [enabled, video, sourceIdentity, report]);
}
