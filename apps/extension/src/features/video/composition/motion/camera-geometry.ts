import { createWindowCameraGeometry } from './window-camera-geometry';
import { resolveMotionSourceWindow } from './source-window';
import {
  boundCameraPlaneProjection,
  type QuickEditCameraProjectionInterval,
} from './spatial-projection-bounds';
import { hasCameraPerspective } from '../../project/motion/spatial';
import { evaluateMotionSpatial } from './spatial';
import {
  type QuickEditHomography,
  projectQuickEditPoint,
  quickEditPlaneProjection,
} from './spatial-geometry';
import { cameraTransitionDerivative } from '../../project/motion/transitions';
import type { CameraTransitionType } from '../../project/motion/transitions';
import { motionTransitionSettings } from '../../project/motion/timing';
import { roundedWindowClearance } from '../../project/window-geometry';
import { boundCameraSourceGeometry, cameraSourceGeometryBreaks } from './camera-source-geometry';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import { resolveProjectOutputTransform } from '../../project/export/output-dimensions';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import { VideoTemporalEasing } from '../../project/types';
import { getMotionAnimationTime } from '../../project/motion/timing';
import { cameraFollowMotionLimits } from '../../project/camera/cursor-policy';
import type { ResolvedCameraFollowPolicy } from '../../project/camera/cursor-policy';
import { buildProjectTransitionSegments } from '../../project/transition/project';
import { getTransitionProgress } from '../../project/transition/runtime';
import {
  resolveTransitionVisualStateForRole,
  transitionVisualAffineBreaks,
} from '../../project/transition/visual-resolvers';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { getFittedMediaContentFrame, getFittedMediaWindowFrame } from '../draw/fitted-media';
import {
  resolveCursorSourcePointMapping,
  mapCursorFocusControlPoint,
  boundRenderedCursorPosition,
  resolveCursorSample,
} from '../timeline/frame/cursor';
import type { WorkingZoneCameraGeometry } from './follow-cursor';
import {
  createCameraTrajectory,
  cameraTrajectoryBounds,
  evaluateCameraTrajectory,
  evaluateCameraTrajectoryDerivative,
} from './camera-trajectory';
import type { CameraPanBounds, CameraPanPoint, CameraTrajectory } from './camera-trajectory';

type Range = readonly [number, number];
export interface ProjectCameraSourceBinding {
  focusClipId?: string;
  actualClipId?: string;
  renderedCursor?: boolean;
  sourceCursor?: boolean;
}
const product = (a: Range, b: Range): Range => {
  const values = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
  return [Math.min(...values), Math.max(...values)];
};
const sum = (a: Range, b: Range): Range => [a[0] + b[0], a[1] + b[1]];
const subtract = (a: Range, b: Range): Range => [a[0] - b[1], a[1] - b[0]];
const multiply = (value: Range, coefficient: number): Range =>
  product(value, [coefficient, coefficient]);

function easingPieces(
  start: number,
  end: number,
  easing: VideoTemporalEasing,
  entering: boolean,
  type?: CameraTransitionType
): CameraTrajectory[] {
  const duration = end - start;
  const sign = entering ? 1 : -1;
  const curve = (
    a: number,
    b: number,
    x0: number,
    x1: number,
    v0: number,
    v1: number,
    a0: number,
    a1: number
  ) =>
    createCameraTrajectory({
      start: a,
      end: b,
      from: { x: entering ? x0 : 1 - x0, y: 0 },
      to: { x: entering ? x1 : 1 - x1, y: 0 },
      fromVelocity: { x: sign * v0, y: 0 },
      toVelocity: { x: sign * v1, y: 0 },
      fromAcceleration: { x: sign * a0, y: 0 },
      toAcceleration: { x: sign * a1, y: 0 },
    });
  if (type !== undefined) {
    if (type === 'none' || type === 'instant') return [];
    return [
      curve(
        start,
        end,
        0,
        1,
        cameraTransitionDerivative(0, type, 1) / duration,
        cameraTransitionDerivative(1, type, 1) / duration,
        cameraTransitionDerivative(0, type, 2) / duration ** 2,
        cameraTransitionDerivative(1, type, 2) / duration ** 2
      ),
    ];
  }
  switch (easing) {
    case VideoTemporalEasing.LINEAR:
      return [curve(start, end, 0, 1, 1 / duration, 1 / duration, 0, 0)];
    case VideoTemporalEasing.EASE_OUT:
      return [curve(start, end, 0, 1, 2 / duration, 0, -2 / duration ** 2, -2 / duration ** 2)];
    case VideoTemporalEasing.EASE_IN_OUT:
      return [
        curve(start, (start + end) / 2, 0, 0.5, 0, 3 / duration, 0, 12 / duration ** 2),
        curve((start + end) / 2, end, 0.5, 1, 3 / duration, 0, -12 / duration ** 2, 0),
      ];
    case VideoTemporalEasing.INSTANT:
      return [];
  }
}

function hasActiveCameraPhase(phase: number | CameraTrajectory, time: number) {
  if (typeof phase === 'number') return Math.abs(phase) > 1e-9;
  return (
    Math.abs(evaluateCameraTrajectory(phase, time).x) > 1e-9 ||
    [1, 2].some(
      (order) =>
        Math.abs(evaluateCameraTrajectoryDerivative(phase, time, order === 1 ? 1 : 2).x) > 1e-9
    )
  );
}

function nominalPhase(
  region: VideoProjectMotionRegion,
  connectedIn: boolean,
  connectedOut: boolean
) {
  const animationDuration = region.animation?.duration ?? region.duration;
  const animationStart = getMotionAnimationTime(region, 0);
  const rate = region.animation
    ? (region.animation.end - region.animation.start) / region.duration
    : 1;
  const output = (local: number) => region.startTime + (local - animationStart) / rate;
  const enterSettings = motionTransitionSettings(region, 'enter');
  const exitSettings = motionTransitionSettings(region, 'exit');
  const enterDuration = Math.min(enterSettings.duration, animationDuration);
  const exitStart = Math.max(0, animationDuration - exitSettings.duration);
  const enter =
    !connectedIn && enterDuration > 0
      ? easingPieces(
          output(0),
          output(enterDuration),
          region.easing,
          true,
          region.phaseTransitions?.enter
        )
      : [];
  const exit =
    !connectedOut && exitSettings.duration > 0
      ? easingPieces(
          output(exitStart),
          output(exitStart + exitSettings.duration),
          region.easing,
          false,
          region.phaseTransitions?.exit
        )
      : [];
  const pieces = [...enter, ...exit];
  const at = (time: number) => {
    const local = getMotionAnimationTime(region, time - region.startTime);
    if (!connectedIn && enterDuration > 0 && local < enterDuration) {
      if (enterSettings.instant) return local <= 0 ? 0 : 1;
      return enter.find((piece) => time <= piece.end) ?? 1;
    }
    if (!connectedOut && exitSettings.duration > 0 && local > exitStart) {
      if (exitSettings.instant) return 0;
      return exit.find((piece) => time <= piece.end) ?? 0;
    }
    return 1;
  };
  const breaks = [
    ...new Set([
      output(0),
      output(enterDuration),
      output(exitStart),
      output(animationDuration),
      ...pieces.flatMap((piece) => [piece.start, piece.end]),
    ]),
  ];
  const discontinuities = pieces.flatMap((piece) =>
    [piece.start, piece.end].filter((time) =>
      [1, 2].some(
        (order) =>
          Math.abs(evaluateCameraTrajectoryDerivative(piece, time, order === 1 ? 1 : 2).x) > 1e-9
      )
    )
  );
  if (!connectedIn && (!enterDuration || enterSettings.instant)) discontinuities.push(output(0));
  if (!connectedOut && (!exitSettings.duration || exitSettings.instant))
    discontinuities.push(output(exitSettings.duration ? exitStart : animationDuration));
  for (const time of [region.startTime, region.startTime + region.duration]) {
    const phase = at(time);
    const active = hasActiveCameraPhase(phase, time);
    if (active && !discontinuities.includes(time)) discontinuities.push(time);
  }
  return { at, breaks, discontinuities };
}

function scalarBounds(
  phase: number | CameraTrajectory,
  start: number,
  end: number,
  order: 0 | 1 | 2 | 3
): Range {
  if (typeof phase === 'number') return order === 0 ? [phase, phase] : [0, 0];
  const bounds = cameraTrajectoryBounds(phase, start, end, order);
  return [bounds.minX, bounds.maxX];
}

function nativeSourceRasterBounds(
  mapping: NonNullable<ReturnType<typeof resolveCursorSourcePointMapping>>,
  nativeX: Range,
  nativeY: Range
) {
  const content = getFittedMediaContentFrame(mapping);
  const x = sum([content.x, content.x], multiply(nativeX, content.width));
  const y = sum([content.y, content.y], multiply(nativeY, content.height));
  const crop = mapping.sourceCrop ?? { x: 0, y: 0, width: 1, height: 1 };
  const left = Math.max(mapping.frame.x, content.x + crop.x * content.width);
  const top = Math.max(mapping.frame.y, content.y + crop.y * content.height);
  const right = Math.min(
    mapping.frame.x + mapping.frame.width,
    content.x + (crop.x + crop.width) * content.width
  );
  const bottom = Math.min(
    mapping.frame.y + mapping.frame.height,
    content.y + (crop.y + crop.height) * content.height
  );
  const rectangularRaster = {
    low: Math.min(x[0] - left, y[0] - top, right - x[1], bottom - y[1]),
    high: Math.min(x[1] - left, y[1] - top, right - x[0], bottom - y[0]),
  };
  const window = getFittedMediaWindowFrame(mapping);
  const rounded = roundedWindowClearance(
    [x[0] - window.x, x[1] - window.x],
    [y[0] - window.y, y[1] - window.y],
    window.width,
    window.height,
    mapping.windowCornerRadius ?? 0
  );
  const raster = mapping.windowCornerRadius
    ? {
        low: Math.min(rectangularRaster.low, rounded.low),
        high: Math.min(rectangularRaster.high, rounded.high),
      }
    : rectangularRaster;
  const center = {
    x: mapping.frame.x + mapping.frame.width / 2,
    y: mapping.frame.y + mapping.frame.height / 2,
  };
  const angle = (mapping.frame.rotation * Math.PI) / 180;
  const projectedX = mapping.mirrored ? subtract([2 * center.x, 2 * center.x], x) : x;
  const dx = subtract(projectedX, [center.x, center.x]),
    dy = subtract(y, [center.y, center.y]);
  const rotatedX = subtract(multiply(dx, Math.cos(angle)), multiply(dy, Math.sin(angle)));
  const rotatedY = sum(multiply(dx, Math.sin(angle)), multiply(dy, Math.cos(angle)));
  return {
    center: { x: [center.x, center.x] as Range, y: [center.y, center.y] as Range },
    rotatedX,
    rotatedY,
    raster,
  };
}

function sourceTransitionStateAt(
  clip: VideoProject['clips'][number],
  transitions: readonly ReturnType<typeof buildProjectTransitionSegments>[number][],
  time: number
) {
  const transition = transitions.find(
    (item) =>
      time >= item.start &&
      (time < item.end || (time === item.end && time === clip.startTime + clip.duration))
  );
  if (!transition) return IDENTITY_TRANSITION_VISUAL_STATE;
  const progress = time === transition.end ? 1 : getTransitionProgress(transition, time);
  return progress === null
    ? IDENTITY_TRANSITION_VISUAL_STATE
    : resolveTransitionVisualStateForRole(
        clip,
        transition.leadingClipId === clip.id ? 'leading' : 'trailing',
        transition,
        progress
      );
}

function sourceVisualLayerBounds(
  clip: VideoProject['clips'][number],
  transitions: readonly ReturnType<typeof buildProjectTransitionSegments>[number][],
  start: number,
  end: number,
  cameraBounds?: ReturnType<typeof boundCameraSourceGeometry> | null
) {
  const geometryClip = cameraBounds
    ? {
        ...clip,
        transform: {
          ...clip.transform,
          width: cameraBounds.width[1],
          height: cameraBounds.height[1],
        },
      }
    : clip;
  const middle = (start + end) / 2;
  const transition = transitions.find(
    (item) =>
      middle >= item.start &&
      (middle < item.end || (middle === item.end && middle === clip.startTime + clip.duration))
  );
  const states = [sourceTransitionStateAt(geometryClip, transitions, middle)];
  if (transition) {
    if (
      ['RADIAL_REVEAL', 'DISPLACEMENT_WARP', 'LINEAR_WIPE', 'CARD_FLIP_REVEAL'].includes(
        transition.transition.kind
      )
    )
      return null;
    const role = transition.leadingClipId === clip.id ? 'leading' : 'trailing';
    const progressValues: number[] = [];
    for (const time of [start, middle, end]) {
      const progress = time === transition.end ? 1 : getTransitionProgress(transition, time);
      if (progress !== null) {
        progressValues.push(progress);
        states.push(resolveTransitionVisualStateForRole(geometryClip, role, transition, progress));
      }
    }
    if (Math.min(...progressValues) <= 0.5 && Math.max(...progressValues) >= 0.5)
      states.push(resolveTransitionVisualStateForRole(geometryClip, role, transition, 0.5));
  }
  const bounds = (key: 'translateX' | 'translateY' | 'scaleX' | 'scaleY'): Range => [
    Math.min(...states.map((state) => state[key])),
    Math.max(...states.map((state) => state[key])),
  ];
  return {
    translateX: product(
      bounds('translateX'),
      cameraBounds ? [cameraBounds.width[0] / cameraBounds.width[1], 1] : [1, 1]
    ),
    translateY: product(
      bounds('translateY'),
      cameraBounds ? [cameraBounds.height[0] / cameraBounds.height[1], 1] : [1, 1]
    ),
    scaleX: bounds('scaleX'),
    scaleY: bounds('scaleY'),
  };
}

/** Resolve the retained monotone easing at exact proof edges, before source projection. */
function sourceCursorIntervalBounds(
  project: VideoProject,
  binding: ProjectCameraSourceBinding,
  start: number,
  end: number,
  actual: { from: CameraPanPoint; to: CameraPanPoint }
) {
  const clipId = binding.actualClipId;
  const from = binding.sourceCursor
    ? resolveCursorSample(project, start, clipId, { includeSourceEnd: true })?.recordingPoint
    : actual.from;
  const to = binding.sourceCursor
    ? resolveCursorSample(project, end, clipId, { includeSourceEnd: true })?.recordingPoint
    : actual.to;
  if (!from || !to) return null;
  const nativeX: Range = [Math.min(from.x, to.x), Math.max(from.x, to.x)];
  const nativeY: Range = [Math.min(from.y, to.y), Math.max(from.y, to.y)];
  return { nativeX, nativeY };
}

/** Supply the rendered source affine and its existing transition clock to window admission. */
export function createProjectWindowPlaneProjection(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
) {
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  if (clip?.type !== 'VIDEO') return {};
  const transform = resolveProjectOutputTransform(
    project,
    output ?? { width: project.width, height: project.height }
  );
  const center = {
    x: clip.transform.x + clip.transform.width / 2,
    y: clip.transform.y + clip.transform.height / 2,
  };
  const angle = (clip.transform.rotation * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const matrix = (
    state: Pick<
      typeof IDENTITY_TRANSITION_VISUAL_STATE,
      'translateX' | 'translateY' | 'scaleX' | 'scaleY'
    >
  ): QuickEditHomography => {
    const a = state.scaleX * c,
      b = -state.scaleX * s,
      d = state.scaleY * s,
      e = state.scaleY * c;
    const x = center.x + state.translateX - a * center.x - b * center.y;
    const y = center.y + state.translateY - d * center.x - e * center.y;
    return [
      a,
      b,
      transform.scale * x + transform.offsetX - a * transform.offsetX - b * transform.offsetY,
      d,
      e,
      transform.scale * y + transform.offsetY - d * transform.offsetX - e * transform.offsetY,
      0,
      0,
      1,
    ];
  };
  const transitions = buildProjectTransitionSegments(project).filter(
    (item) => item.leadingClipId === clip.id || item.trailingClipId === clip.id
  );
  const pieces = transitions.map((segment) => {
    const phase = easingPieces(
      segment.start,
      segment.end,
      segment.transition.easing === 'LINEAR'
        ? VideoTemporalEasing.LINEAR
        : VideoTemporalEasing.EASE_IN_OUT,
      true
    );
    const knots = transitionVisualAffineBreaks(segment);
    const inverseProgress = (value: number) =>
      segment.transition.easing === 'LINEAR'
        ? value
        : value <= 0.5
          ? Math.cbrt(value / 4)
          : 1 - Math.cbrt((1 - value) / 4);
    return {
      segment,
      phase,
      knots,
      breaks: knots.map(
        (value) => segment.start + inverseProgress(value) * (segment.end - segment.start)
      ),
    };
  });
  const planeBreaks = pieces.flatMap((item) => [
    ...item.breaks,
    ...item.phase.flatMap((phase) => [phase.start, phase.end]),
  ]);
  const intervalPlane = (
    start: number,
    end: number
  ): Pick<QuickEditCameraProjectionInterval, 'planeTransform' | 'planeTransition'> | null => {
    if (planeBreaks.some((time) => start < time && time < end)) return null;
    const time = (start + end) / 2;
    const piece = pieces.find((item) => time >= item.segment.start && time < item.segment.end);
    if (!piece) return { planeTransform: matrix(IDENTITY_TRANSITION_VISUAL_STATE) };
    const { segment } = piece;
    const progress = getTransitionProgress(segment, time);
    if (progress === null) return null;
    const index = Math.max(
      0,
      piece.knots.findLastIndex((value) => value <= progress)
    );
    const low = piece.knots[Math.min(index, piece.knots.length - 2)]!,
      high = piece.knots[Math.min(index + 1, piece.knots.length - 1)]!;
    const role = segment.leadingClipId === clip.id ? 'leading' : 'trailing';
    const a = matrix(resolveTransitionVisualStateForRole(clip, role, segment, low));
    const b = matrix(resolveTransitionVisualStateForRole(clip, role, segment, high));
    const value = (index: number, at: number) =>
      a[index]! + ((b[index]! - a[index]!) * (at - low)) / (high - low);
    const endpoint = (at: number): QuickEditHomography => [
      value(0, at),
      value(1, at),
      value(2, at),
      value(3, at),
      value(4, at),
      value(5, at),
      0,
      0,
      1,
    ];
    const phase = piece.phase.find((phase) => time >= phase.start && time <= phase.end);
    return phase ? { planeTransition: { from: endpoint(0), to: endpoint(1), phase } } : null;
  };
  return { planeBreaks, intervalPlane };
}

/** Bind native source coordinates, actual clip fitting, and authored phase clocks to camera admission. */
export function createProjectWorkingZoneCameraGeometry(input: {
  project: VideoProject;
  region: VideoProjectMotionRegion;
  bindings: ReadonlyMap<string, ProjectCameraSourceBinding>;
  connectedIn: boolean;
  connectedOut: boolean;
  policy: ResolvedCameraFollowPolicy;
  output?: CameraOutputViewport;
}): WorkingZoneCameraGeometry {
  const { project } = input;
  const size = input.output ?? { width: project.width, height: project.height };
  const output = { width: size.width, height: size.height };
  const transform = resolveProjectOutputTransform(project, size);
  const scaleX = transform.scale,
    scaleY = transform.scale;
  const window = {
    width: project.width * transform.scale,
    height: project.height * transform.scale,
  };
  const bound = project.clips.find((clip) => clip.id === input.region.sourceBinding?.clipId);
  const sourceWindow = resolveMotionSourceWindow(
    project,
    input.region,
    Math.max(input.region.startTime, bound?.startTime ?? input.region.startTime)
  );
  if (sourceWindow) {
    const mapRect = (rect: typeof sourceWindow.window) => ({
      x: rect.x * transform.scale + transform.offsetX,
      y: rect.y * transform.scale + transform.offsetY,
      width: rect.width * transform.scale,
      height: rect.height * transform.scale,
    });
    const region = input.region;
    const clock = region.animation;
    const clockScale = clock ? region.duration / (clock.end - clock.start) : 1;
    const start = region.startTime - (clock?.start ?? 0) * clockScale;
    const enter = motionTransitionSettings(region, 'enter');
    const exit = motionTransitionSettings(region, 'exit');
    const clip = project.clips.find((item) => item.id === sourceWindow.clipId);
    return createWindowCameraGeometry({
      output,
      window: mapRect(sourceWindow.window),
      ...createProjectWindowPlaneProjection(project, region, size),
      video: mapRect(sourceWindow.video),
      cornerRadius: clip?.type === 'VIDEO' ? (clip.windowCornerRadius ?? 0) * transform.scale : 0,
      windowWeight: 'window',
      region: {
        ...region,
        start,
        end: start + (clock?.duration ?? region.duration) * clockScale,
        enter: { ...enter, duration: enter.duration * clockScale },
        exit: { ...exit, duration: exit.duration * clockScale },
      },
      connectedIn: input.connectedIn,
      connectedOut: input.connectedOut,
      policy: input.policy,
    });
  }
  const phase = nominalPhase(input.region, input.connectedIn, input.connectedOut);
  const perspective = hasCameraPerspective(input.region.perspective)
    ? input.region.perspective
    : null;
  const ref = input.region.spatialReference ?? { x: 0, y: 0, width: 1, height: 1 };
  const reference = {
    x: ref.x * window.width,
    y: ref.y * window.height,
    width: ref.width * window.width,
    height: ref.height * window.height,
  };
  const projectPoint = (point: CameraPanPoint, targetScale: number, progress: number) => {
    if (!perspective)
      return {
        x: point.x * (1 + (targetScale - 1) * progress),
        y: point.y * (1 + (targetScale - 1) * progress),
      };
    const spatial = evaluateMotionSpatial(project, null, input.region, progress)!;
    const scale = 1 + (targetScale - 1) * progress;
    const projection = quickEditPlaneProjection(
      reference,
      {
        x: reference.x * scale,
        y: reference.y * scale,
        width: reference.width * scale,
        height: reference.height * scale,
      },
      spatial
    );
    return projectQuickEditPoint(projection, point);
  };

  const transitions = buildProjectTransitionSegments(project);
  const clips = new Map(project.clips.map((clip) => [clip.id, clip]));
  const mappings = new Map(
    [
      ...new Set(
        [...input.bindings.values()].flatMap((binding) => [
          binding.focusClipId,
          binding.actualClipId,
        ])
      ),
    ].flatMap((clipId) => {
      if (!clipId) return [];
      const mapping = resolveCursorSourcePointMapping(project, clipId, input.region.startTime);
      return mapping ? [[clipId, mapping] as const] : [];
    })
  );
  const transitionsByClip = new Map(
    [...mappings.keys()].map((clipId) => [
      clipId,
      transitions.filter(
        (transition) => transition.leadingClipId === clipId || transition.trailingClipId === clipId
      ),
    ])
  );
  const domain = (scale: number): CameraPanBounds => ({
    minX: 0,
    minY: 0,
    maxX: (scale - 1) * window.width,
    maxY: (scale - 1) * window.height,
  });
  const worldPoint = (point: CameraPanPoint, segmentId: string, time: number, actual = false) => {
    if (!input.bindings.has(segmentId)) return null;
    const binding = input.bindings.get(segmentId)!;
    const clipId = actual ? binding.actualClipId : binding.focusClipId;
    if (!clipId) return { x: point.x * window.width, y: point.y * window.height };
    const clip = clips.get(clipId);
    const camera =
      clip?.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA');
    const mapping = camera
      ? resolveCursorSourcePointMapping(project, clipId, time)
      : mappings.get(clipId);
    if (!mapping) return null;
    const mapped = mapCursorFocusControlPoint(
      camera
        ? mapping
        : {
            ...mapping,
            renderState: sourceTransitionStateAt(clip!, transitionsByClip.get(clipId) ?? [], time),
          },
      point
    );
    return { x: mapped.x * scaleX, y: mapped.y * scaleY };
  };
  const sourceBounds = (
    segmentId: string,
    start: number,
    end: number,
    actual?: { from: CameraPanPoint; to: CameraPanPoint }
  ) => {
    if (!input.bindings.has(segmentId)) return null;
    const binding = input.bindings.get(segmentId)!;
    if (binding.renderedCursor) {
      const rendered = boundRenderedCursorPosition(project, start, end);
      return rendered
        ? {
            x: multiply([rendered.minX, rendered.maxX], scaleX),
            y: multiply([rendered.minY, rendered.maxY], scaleY),
            raster: { low: 1, high: 1 },
            rasterScale: [1, 1] satisfies Range,
          }
        : { unavailable: true as const };
    }
    if (!actual) return null;
    const clipId = binding.actualClipId;
    const native = sourceCursorIntervalBounds(project, binding, start, end, actual);
    if (!native) return { unavailable: true as const };
    const { nativeX, nativeY } = native;
    if (!clipId)
      return {
        x: multiply(nativeX, window.width),
        y: multiply(nativeY, window.height),
        raster: { low: 1, high: 1 },
        rasterScale: [1, 1] as Range,
      };
    const clip = clips.get(clipId);
    const mapping = mappings.get(clipId);
    if (!clip || !mapping) return null;
    const camera =
      clip.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA');
    const cameraBounds = camera
      ? boundCameraSourceGeometry({ project, clip, mapping, nativeX, nativeY, start, end })
      : null;
    const { center, rotatedX, rotatedY, raster } =
      cameraBounds ?? nativeSourceRasterBounds(mapping, nativeX, nativeY);
    const visual = sourceVisualLayerBounds(
      clip,
      transitionsByClip.get(clipId) ?? [],
      start,
      end,
      cameraBounds
    );
    if (!visual) return null;
    const layerX = visual.scaleX,
      layerY = visual.scaleY;
    return {
      x: multiply(sum(sum(center.x, visual.translateX), product(layerX, rotatedX)), scaleX),
      y: multiply(sum(sum(center.y, visual.translateY), product(layerY, rotatedY)), scaleY),
      raster,
      rasterScale: [
        Math.min(layerX[0] * scaleX, layerY[0] * scaleY),
        Math.max(layerX[1] * scaleX, layerY[1] * scaleY),
      ] as Range,
    };
  };
  return {
    viewport: { ...output },
    window,
    discontinuities: (targetScale) => (targetScale === 1 ? [] : phase.discontinuities),
    breaks: [
      ...phase.breaks,
      ...project.clips.flatMap((clip) => [clip.startTime, clip.startTime + clip.duration]),
      ...transitions.flatMap((transition) => [
        transition.start,
        (transition.start + transition.end) / 2,
        transition.end,
      ]),
      ...project.clips.flatMap((clip) =>
        clip.type === 'VIDEO' &&
        project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
          ? cameraSourceGeometryBreaks(clip, project)
          : []
      ),
      ...(project.cursorTrack?.samples ?? []).map((sample) => sample.time),
    ],
    panDomain: domain,
    preferredPan(frame, scale) {
      const point = worldPoint(frame, frame.segmentId, frame.time);
      const projected = point && projectPoint(point, scale, 1);
      return projected
        ? {
            x: transform.offsetX + projected.x - output.width / 2,
            y: transform.offsetY + projected.y - output.height / 2,
          }
        : { x: 0, y: 0 };
    },
    pointPanBounds(frame, scale, marginFraction = 0) {
      const bounds = domain(scale);
      if (!frame.actual) return bounds;
      const point = worldPoint(frame.actual, frame.segmentId, frame.time, true);
      if (!point) return null;
      const curve = phase.at(frame.time);
      const progress =
        typeof curve === 'number' ? curve : evaluateCameraTrajectory(curve, frame.time).x;
      if (progress <= 1e-12) return bounds;
      const projected = projectPoint(point, scale, progress);
      if (!projected) return null;
      const mx = output.width * marginFraction,
        my = output.height * marginFraction;
      return {
        minX: Math.max(0, (transform.offsetX + projected.x - output.width + mx) / progress),
        maxX: Math.min(bounds.maxX, (transform.offsetX + projected.x - mx) / progress),
        minY: Math.max(0, (transform.offsetY + projected.y - output.height + my) / progress),
        maxY: Math.min(bounds.maxY, (transform.offsetY + projected.y - my) / progress),
      };
    },
    clearanceBounds({ start, end, segmentId, pan, actual, targetScale, preservePointer }) {
      const pose = domain(targetScale);
      const result = {
        pose: {
          low: Math.min(pan.minX, pan.minY, pose.maxX - pan.maxX, pose.maxY - pan.maxY),
          high: Math.min(pan.maxX, pan.maxY, pose.maxX - pan.minX, pose.maxY - pan.minY),
        },
        denominator: { low: 1, high: 1 },
      };
      if (preservePointer === false || (!actual && !input.bindings.get(segmentId)?.renderedCursor))
        return result;
      const source = sourceBounds(segmentId, start, end, actual);
      if (!source) return null;
      if ('unavailable' in source) return result;
      const g = scalarBounds(phase.at((start + end) / 2), start, end, 0);
      const projected = (position: Range, offset: Range) =>
        sum(position, product(g, subtract(multiply(position, targetScale - 1), offset)));
      const x = sum(
        [transform.offsetX, transform.offsetX],
        projected(source.x, [pan.minX, pan.maxX])
      );
      const y = sum(
        [transform.offsetY, transform.offsetY],
        projected(source.y, [pan.minY, pan.maxY])
      );
      const raster = product(
        [source.raster.low, source.raster.high],
        product(source.rasterScale, [1 + (targetScale - 1) * g[0], 1 + (targetScale - 1) * g[1]])
      );
      const spatial = perspective
        ? boundCameraPlaneProjection({
            start,
            end,
            phase: phase.at((start + end) / 2),
            targetScale,
            pan,
            perspective,
            reference,
            source: { x: source.x, y: source.y },
            output,
            offset: { x: transform.offsetX, y: transform.offsetY },
          })
        : null;
      if (perspective && !spatial) return null;
      return {
        ...result,
        ...(spatial ?? {}),
        raster: { low: raster[0], high: raster[1] },
        viewport: spatial?.viewport ?? {
          low: Math.min(x[0], y[0], output.width - x[1], output.height - y[1]),
          high: Math.min(x[1], y[1], output.width - x[0], output.height - y[0]),
        },
      };
    },
    motionBounds({ start, end, trajectory }) {
      if (!trajectory) return { speed: 0, acceleration: 0, jerk: 0 };
      const curve = phase.at((start + end) / 2);
      const g = [0, 1, 2].map((order) =>
        scalarBounds(curve, start, end, order === 0 ? 0 : order === 1 ? 1 : 2)
      );
      const derivatives = ([1, 2, 3] as const).map((order) =>
        cameraTrajectoryBounds(trajectory, start, end, order)
      );
      const axis = (axis: 'x' | 'y') => {
        const p: Range[] = derivatives.map((bounds) =>
          axis === 'x' ? [bounds.minX, bounds.maxX] : [bounds.minY, bounds.maxY]
        );
        return [
          product(g[0]!, p[0]!),
          sum(multiply(product(g[1]!, p[0]!), 2), product(g[0]!, p[1]!)),
          sum(
            sum(multiply(product(g[2]!, p[0]!), 3), multiply(product(g[1]!, p[1]!), 3)),
            product(g[0]!, p[2]!)
          ),
        ];
      };
      const x = axis('x'),
        y = axis('y');
      const norm = (order: number) =>
        Math.hypot(Math.max(...x[order]!.map(Math.abs)), Math.max(...y[order]!.map(Math.abs)));
      return { speed: norm(0), acceleration: norm(1), jerk: norm(2) };
    },
    motionLimits(start, end, targetScale) {
      const values = [start, end, ...phase.breaks.filter((time) => time > start && time < end)].map(
        (time) => {
          const curve = phase.at(time);
          return typeof curve === 'number' ? curve : evaluateCameraTrajectory(curve, time).x;
        }
      );
      return cameraFollowMotionLimits(input.policy, {
        viewportWidth: output.width,
        viewportHeight: output.height,
        windowWidth: window.width,
        windowHeight: window.height,
        minimumScale: 1 + (targetScale - 1) * Math.min(...values),
      });
    },
  };
}
