import {
  createWindowCameraGeometry,
  createWindowCameraLinkGeometry,
  proveWindowCameraGap,
} from '../../composition/motion/window-camera-geometry';
import type { proveCameraPlan } from '../../composition/motion/camera-plan-proof';
import type { ResolvedCameraFollowPolicy } from '../../project/camera/cursor-policy';
import type { WorkingZoneCameraGeometry } from '../../composition/motion/follow-cursor';
import { fitQuickEditZoomTransitions } from './zoom';
import { resolveQuickEditFocusLink } from './focus-layout';
import { quickEditSpatialSpan } from './spatial';
import { hasCameraPerspective as hasQuickEditPerspective } from '../../project/motion/spatial';
import type {
  QuickEditBackgroundSettings,
  QuickEditZoomRegion,
  QuickEditCameraTransform,
} from './types';
import type { QuickEditRect, QuickEditCameraSceneInput } from './types';

/** Bind real static layout and authored nominal phases to the pure working-zone planner. */
export function createReviewWorkingZoneCameraGeometry(input: {
  output: { width: number; height: number };
  window: QuickEditRect;
  video: QuickEditRect;
  cornerRadius: number;
  background: QuickEditBackgroundSettings;
  region: QuickEditZoomRegion;
  topology: readonly QuickEditZoomRegion[];
  policy: ResolvedCameraFollowPolicy;
}): WorkingZoneCameraGeometry {
  const region = fitQuickEditZoomTransitions(input.region, input.region.end - input.region.start);
  const linkedPrevious = input.topology.some(
    (item) => resolveQuickEditFocusLink(input.topology, item.id)?.target.id === region.id
  );
  const linkedNext = resolveQuickEditFocusLink(input.topology, region.id) !== null;
  const lockBackground = quickEditSpatialSpan(input.topology, (region.start + region.end) / 2);
  const follows =
    input.background.enabled && input.background.zoomBehavior === 'follow-video' && !lockBackground;
  const windowWeight =
    input.background.zoomBehavior === 'window' || follows
      ? 'window'
      : input.background.zoomBehavior === 'content' || !hasQuickEditPerspective(region.perspective)
        ? 'content'
        : 'spatial';
  return createWindowCameraGeometry({
    output: input.output,
    window: input.window,
    video: input.video,
    cornerRadius: input.cornerRadius,
    policy: input.policy,
    region,
    windowWeight,
    connectedIn: linkedPrevious,
    connectedOut: linkedNext,
  });
}

/** Bound the renderer's authored link between frozen camera endpoints, including its nominal discontinuities. */
export function createReviewCameraLinkGeometry(input: {
  output: { width: number; height: number };
  window: QuickEditRect;
  video: QuickEditRect;
  cornerRadius: number;
  background: QuickEditBackgroundSettings;
  topology: readonly QuickEditZoomRegion[];
  from: { region: QuickEditZoomRegion; scale: number; pan: { x: number; y: number } };
  to: { region: QuickEditZoomRegion; scale: number; pan: { x: number; y: number } };
  policy: ResolvedCameraFollowPolicy;
}) {
  const start = input.from.region.end,
    end = input.to.region.start;
  const lockBackground = quickEditSpatialSpan(input.topology, (start + end) / 2);
  const follows =
    input.background.enabled && input.background.zoomBehavior === 'follow-video' && !lockBackground;
  const windowWeight =
    input.background.zoomBehavior === 'window' || follows
      ? 'window'
      : input.background.zoomBehavior === 'content' || !lockBackground
        ? 'content'
        : 'spatial';
  return createWindowCameraLinkGeometry({
    output: input.output,
    window: input.window,
    video: input.video,
    cornerRadius: input.cornerRadius,
    windowWeight,
    type: input.from.region.linkEasing ?? 'ease-in-out',
    policy: input.policy,
    from: {
      end: start,
      scale: input.from.scale,
      pan: input.from.pan,
      ...(input.from.region.perspective ? { perspective: input.from.region.perspective } : {}),
    },
    to: {
      start: end,
      scale: input.to.scale,
      pan: input.to.pan,
      ...(input.to.region.perspective ? { perspective: input.to.region.perspective } : {}),
    },
  });
}

/** Prove an authored gap from frozen admitted endpoints and native observation runs. */
export function proveReviewCameraGap(input: {
  output: { width: number; height: number };
  layout: { windowRect: QuickEditRect; videoRect: QuickEditRect };
  scene: QuickEditCameraSceneInput;
  regions: readonly QuickEditZoomRegion[];
  source: QuickEditZoomRegion;
  target: QuickEditZoomRegion;
  from: QuickEditCameraTransform;
  to: QuickEditCameraTransform;
  policy: ResolvedCameraFollowPolicy;
  observations: Parameters<typeof proveCameraPlan>[0]['observations'];
}) {
  const { source, target, output, layout, scene, policy, observations } = input;
  const pan = (camera: QuickEditCameraTransform) => ({
    x:
      Math.max(0, Math.min(camera.scale - 1, camera.centerX * camera.scale - 0.5)) *
      layout.windowRect.width,
    y:
      Math.max(0, Math.min(camera.scale - 1, camera.centerY * camera.scale - 0.5)) *
      layout.windowRect.height,
  });
  const toPan = pan(input.to);
  const adapter = createReviewCameraLinkGeometry({
    output,
    window: layout.windowRect,
    video: layout.videoRect,
    cornerRadius: scene.background.enabled
      ? (scene.background.layout.cornerRadius * output.width) /
        (scene.canvas?.width ?? scene.source.width)
      : 0,
    background: scene.background,
    topology: input.regions,
    from: { region: source, scale: input.from.scale, pan: pan(input.from) },
    to: { region: target, scale: input.to.scale, pan: toPan },
    policy,
  });
  return proveWindowCameraGap({
    adapter,
    start: source.end,
    end: target.start,
    targetScale: input.to.scale,
    toPan,
    policy,
    observations,
  });
}

/** Select every nominal field that the cached renderer geometry or authored link can read. */
export function reviewCameraNominalDescriptor(region: QuickEditZoomRegion) {
  return {
    id: region.id,
    start: region.start,
    end: region.end,
    transform: region.transform,
    enter: region.enter,
    exit: region.exit,
    linkTo: region.linkTo,
    linkEasing: region.linkEasing,
    perspective: region.perspective,
    dormant: region.dormant,
    spotlight: !!region.spotlight,
  };
}

/** Frozen endpoint metadata identifies the gap proof without serializing captured observations. */
export function reviewCameraGapSignature(
  input: Pick<
    Parameters<typeof proveReviewCameraGap>[0],
    'source' | 'target' | 'from' | 'to' | 'scene' | 'policy'
  >
) {
  return JSON.stringify({
    source: reviewCameraNominalDescriptor(input.source),
    target: reviewCameraNominalDescriptor(input.target),
    from: input.from,
    to: input.to,
    input: input.scene,
    policy: input.policy,
  });
}
