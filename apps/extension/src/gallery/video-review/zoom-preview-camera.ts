import { cameraSpatialMotionPose } from '../../features/video/project/motion/spatial';
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
  sourceFilters?:
    | import('../../features/image-filters/contract').SourceImageFilterStack
    | undefined;
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
  sourceFilters: ZoomPreviewProps['sourceFilters'];
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

function needsPreviewCameraPlan(scene: ZoomCameraScene) {
  return (
    !scene.region.border &&
    !scene.region.spotlight &&
    (scene.focus?.regions ?? [scene.region]).some(
      (region) =>
        (region.id === scene.region.id || region.id.startsWith(`${scene.region.id}:slice:`)) &&
        region.cursorFocus?.path.mode === 'follow'
    )
  );
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
    sourceFilters,
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
      sourceFilters,
      canvas,
      windowHeader,
      sourceTime,
      loadFrame,
      playback,
    }),
    [
      region,
      focus,
      background,
      source,
      sourceFilters,
      canvas,
      windowHeader,
      sourceTime,
      loadFrame,
      playback,
    ]
  );
  const sourceLifetime = useMemo(
    () => ({ loadFrame, width: source.width, height: source.height }),
    [loadFrame, source.width, source.height]
  );
  const lifetime = useMemo(
    () => ({ selectionId: region.id, source: sourceLifetime }),
    [region.id, sourceLifetime]
  );
  const needsPlan = needsPreviewCameraPlan(snapshot);
  const [completed, setCompleted] = useState<{
    owner: typeof lifetime;
    value: PreparedZoomCamera;
  } | null>(null);
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
        const admission = needsPreviewCameraPlan(scene)
          ? resolvePreviewCameraAdmission(scene)
          : { followPlan: null, cameraConflicts: [] };
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
  const current = completed?.owner === owner.identity ? completed.value : null;
  // A warm selection can remain visible only within the same decoded source lifetime.
  const retained = completed?.owner.source === sourceLifetime ? completed.value : null;
  useEffect(() => {
    owner.scheduler.update({
      scene: snapshot,
      generation: 'selected-preview',
      visible: needsPlan ? !holdFollowDraft : !current,
      playing: false,
      interacting: false,
      frameRate: null,
      detailedPaused: false,
      pausedTime: 0,
    });
  }, [owner, snapshot, needsPlan, holdFollowDraft, current]);
  return {
    value: !current
      ? retained
      : needsPlan
        ? current
        : {
            snapshot,
            camera: resolvePreviewCamera(snapshot),
            admission: { followPlan: null, cameraConflicts: [] },
          },
    pending: !current || (needsPlan && (holdFollowDraft || current.snapshot !== snapshot)),
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
    quickEditSpatialTargetCamera(cameraSpatialMotionPose(effective ?? props.region, 0.5), time),
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
