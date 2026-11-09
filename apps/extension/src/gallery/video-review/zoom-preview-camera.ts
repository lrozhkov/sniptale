import { useEffect, useMemo, useState } from 'react';
import { resolveQuickEditFocusLink } from '../../features/video/review/advanced/focus-layout';

import { evaluateReviewFollowCursor } from '../../features/video/review/advanced/cursor-focus-path';
import { quickEditSpatialTargetCamera } from '../../features/video/review/advanced/spatial';
import {
  resolveReviewCameraGeometry,
  resolveReviewSceneCameraPlan,
  resolveReviewCameraConflicts,
  quickEditCropCamera,
} from '../../features/video/review/advanced/scene';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
} from '../../features/video/review/advanced/types';
import type { QuickEditZoomRegionPatch } from '../../features/video/review/advanced/zoom';
import type { ZoomPreviewFrameLoader } from './use-zoom-preview-source';
import {
  createReviewPreviewPresentation,
  createReviewPresentationPaintClock,
} from './preview-presentation';

/** Selected framing data and commands; the caller retains authoring ownership. */
export type ZoomPreviewProps = {
  region: QuickEditZoomRegion;
  cursorFollowing?: boolean;
  /** Keep completed follow geometry while the inspector owns a transient gesture. */
  previewing?: boolean;
  spatialEdit?: {
    region: QuickEditZoomRegion;
    revision: string;
    enabled?: boolean;
    onCommit(revision: string, patch: QuickEditZoomRegionPatch): void;
  };
  focus?: { regions: readonly QuickEditZoomRegion[]; time: number } | undefined;
  background: QuickEditBackgroundSettings;
  source: { width: number; height: number };
  canvas?: { width: number; height: number } | undefined;
  windowHeader?:
    | import('../../features/video/review/advanced/types').QuickEditWindowHeader
    | undefined;
  /** Result-time region midpoint mapped through cuts/speed; null while it has no frame. */
  sourceTime: number | null;
  loadFrame: ZoomPreviewFrameLoader | null;
  /** Read-only transport sample while playing; paused editing retains the selected target. */
  playback?:
    | {
        video: HTMLVideoElement;
        camera: QuickEditZoomRegion['transform'];
        source?: {
          readonly url: string;
          readonly time: number;
          readonly seekRevision: number;
          readonly segmentStart?: number | null;
        };
      }
    | undefined;
  onInteract?: ((sourceTime: number) => void) | undefined;
  onChange(patch: QuickEditZoomRegionPatch): void;
  onPreview?: ((patch: QuickEditZoomRegionPatch | null) => void) | undefined;
  disabled?: boolean;
};

type ZoomCameraScene = {
  region: ZoomPreviewProps['region'];
  focus: ZoomPreviewProps['focus'];
  background: ZoomPreviewProps['background'];
  source: ZoomPreviewProps['source'];
  canvas: ZoomPreviewProps['canvas'];
  windowHeader: ZoomPreviewProps['windowHeader'];
  sourceTime: ZoomPreviewProps['sourceTime'];
  loadFrame: ZoomPreviewProps['loadFrame'];
  playback: ZoomPreviewProps['playback'];
};

function resolvePreviewCameraAdmission(props: ZoomCameraScene) {
  const region = props.region;
  const followRegion =
    !region.border && !region.spotlight
      ? props.focus?.regions.find(
          (item) => item.id === region.id || item.id.startsWith(`${region.id}:slice:`)
        )
      : undefined;
  const followGeometry =
    followRegion &&
    resolveReviewCameraGeometry(props.focus?.regions ?? [followRegion], followRegion, {
      source: props.source,
      canvas: props.canvas,
      windowHeader: props.windowHeader,
      background: props.background,
    });
  const followPlan =
    followRegion && followGeometry
      ? resolveReviewSceneCameraPlan(props.focus?.regions ?? [followRegion], followRegion, {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        })
      : null;

  const topology = props.focus?.regions ?? [region];
  const outgoing = resolveQuickEditFocusLink(topology, followRegion?.id ?? region.id);
  const incoming = topology.find(
    (item) =>
      resolveQuickEditFocusLink(topology, item.id)?.target.id === (followRegion?.id ?? region.id)
  );
  const cameraConflicts = topology.some((item) => item.cursorFocus)
    ? resolveReviewCameraConflicts(
        topology,
        {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        },
        { start: incoming?.end ?? region.start, end: outgoing?.target.start ?? region.end }
      )
    : [];
  return { followPlan, cameraConflicts };
}

/** One completed camera preparation binds its geometry and admission status to its scene. */
export type PreparedZoomCamera = {
  snapshot: ZoomCameraScene;
  camera: ReturnType<typeof resolvePreviewCamera>;
  admission: ReturnType<typeof resolvePreviewCameraAdmission>;
};

/** The existing presentation owner admits planning after a paint and replaces pending snapshots. */
export function usePreparedZoomCamera(props: ZoomPreviewProps) {
  const {
    region,
    focus,
    background,
    source,
    canvas,
    windowHeader,
    sourceTime,
    loadFrame,
    playback,
  } = props;
  const snapshot = useMemo(
    () => ({
      region,
      focus,
      background,
      source,
      canvas,
      windowHeader,
      sourceTime,
      loadFrame,
      playback,
    }),
    [region, focus, background, source, canvas, windowHeader, sourceTime, loadFrame, playback]
  );
  const lifetime = useMemo(
    () => ({ selectionId: region.id, loadFrame, width: source.width, height: source.height }),
    [region.id, loadFrame, source.width, source.height]
  );
  const needsPlan =
    !props.region.border &&
    !props.region.spotlight &&
    (props.focus?.regions ?? [props.region]).some(
      (region) => region.cursorFocus?.path.mode === 'follow'
    );
  const [completed, setCompleted] = useState<{ owner: object; value: PreparedZoomCamera } | null>(
    null
  );
  const [failed, setFailed] = useState<object | null>(null);
  const owner = useMemo(() => {
    const identity = lifetime;
    const lease = <T>(value: T) => ({ value, release() {} });
    const scheduler = createReviewPreviewPresentation<
      ZoomCameraScene,
      PreparedZoomCamera,
      null,
      PreparedZoomCamera
    >({
      ...createReviewPresentationPaintClock(),
      now: () => performance.now(),
      sampleTime: () => 0,
      prepare: async ({ scene }, signal) => {
        signal.throwIfAborted();
        const camera = resolvePreviewCamera(scene);
        const admission = resolvePreviewCameraAdmission(scene);
        signal.throwIfAborted();
        return lease({ snapshot: scene, camera, admission });
      },
      capture: () => lease(null),
      render: (prepared) => lease(prepared),
      publish: (value) => {
        setCompleted({ owner: identity, value });
        setFailed(null);
      },
      onError: () => setFailed(identity),
    });
    return { identity, scheduler };
  }, [lifetime]);
  useEffect(() => () => owner.scheduler.dispose(), [owner]);
  const holdFollowDraft = props.previewing === true && props.cursorFollowing === true;
  useEffect(() => {
    owner.scheduler.update({
      scene: snapshot,
      generation: 'selected-preview',
      visible: needsPlan && !holdFollowDraft,
      playing: false,
      interacting: false,
      frameRate: null,
      detailedPaused: false,
      pausedTime: 0,
    });
  }, [owner, snapshot, needsPlan, holdFollowDraft]);
  const current = completed?.owner === owner.identity ? completed.value : null;
  return {
    value: needsPlan
      ? current
      : {
          snapshot,
          camera: resolvePreviewCamera(snapshot),
          admission: { followPlan: null, cameraConflicts: [] },
        },
    pending: needsPlan && (holdFollowDraft || current?.snapshot !== snapshot),
    failed: failed === owner.identity,
    retry: () => owner.scheduler.invalidate(),
  };
}

/** Overlay framing stays unzoomed; Zoom follows the sampled playback camera. */
function resolvePreviewCamera(props: ZoomCameraScene) {
  if (props.region.spotlight || props.region.border)
    return { scale: 1, centerX: 0.5, centerY: 0.5 };
  if (props.playback) return props.playback.camera;
  const time = props.focus?.time ?? (props.region.start + props.region.end) / 2;
  const effective = props.focus?.regions.find(
    (region) =>
      (region.id === props.region.id || region.id.startsWith(`${props.region.id}:slice:`)) &&
      time >= region.start &&
      time < region.end
  );
  const target = quickEditCropCamera(
    quickEditSpatialTargetCamera(effective ?? props.region, time),
    props
  );
  return effective?.cursorFocus?.path.mode === 'follow'
    ? evaluateReviewFollowCursor(
        effective,
        time,
        target,
        resolveReviewCameraGeometry(props.focus?.regions ?? [effective], effective, {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        }),
        resolveReviewSceneCameraPlan(props.focus?.regions ?? [effective], effective, {
          source: props.source,
          canvas: props.canvas,
          windowHeader: props.windowHeader,
          background: props.background,
        }) ?? undefined
      )
    : target;
}
