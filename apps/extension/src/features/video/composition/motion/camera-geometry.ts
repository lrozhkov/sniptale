import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import { resolveProjectOutputTransform } from '../../project/export/output-dimensions';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import { VideoTemporalEasing } from '../../project/types';
import { getMotionAnimationTime } from '../../project/motion/timing';
import { cameraFollowMotionLimits } from '../../project/camera/cursor-policy';
import type { ResolvedCameraFollowPolicy } from '../../project/camera/cursor-policy';
import { buildProjectTransitionSegments } from '../../project/transition/project';
import { getTransitionProgress } from '../../project/transition/runtime';
import { resolveTransitionVisualStateForRole } from '../../project/transition/visual-resolvers';
import { IDENTITY_TRANSITION_VISUAL_STATE } from '../../project/transition/presentation.types';
import { getFittedMediaContentFrame } from '../draw/fitted-media';
import {
  resolveCursorSourcePointMapping,
  mapCursorFocusControlPoint,
  boundRenderedCursorPosition,
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
  entering: boolean
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
  const enterDuration = Math.min(region.zoomInDuration, animationDuration);
  const exitStart = Math.max(0, animationDuration - region.zoomOutDuration);
  const enter =
    !connectedIn && enterDuration > 0
      ? easingPieces(output(0), output(enterDuration), region.easing, true)
      : [];
  const exit =
    !connectedOut && region.zoomOutDuration > 0
      ? easingPieces(
          output(exitStart),
          output(exitStart + region.zoomOutDuration),
          region.easing,
          false
        )
      : [];
  const pieces = [...enter, ...exit];
  const at = (time: number) => {
    const local = getMotionAnimationTime(region, time - region.startTime);
    if (!connectedIn && enterDuration > 0 && local < enterDuration) {
      if (region.easing === VideoTemporalEasing.INSTANT) return local <= 0 ? 0 : 1;
      return enter.find((piece) => time <= piece.end) ?? 1;
    }
    if (!connectedOut && region.zoomOutDuration > 0 && local > exitStart) {
      if (region.easing === VideoTemporalEasing.INSTANT) return 0;
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
  if (!connectedIn && (!enterDuration || region.easing === VideoTemporalEasing.INSTANT))
    discontinuities.push(output(0));
  if (!connectedOut && (!region.zoomOutDuration || region.easing === VideoTemporalEasing.INSTANT))
    discontinuities.push(output(region.zoomOutDuration ? exitStart : animationDuration));
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
  const raster = {
    low: Math.min(
      x[0] - mapping.frame.x,
      y[0] - mapping.frame.y,
      mapping.frame.x + mapping.frame.width - x[1],
      mapping.frame.y + mapping.frame.height - y[1]
    ),
    high: Math.min(
      x[1] - mapping.frame.x,
      y[1] - mapping.frame.y,
      mapping.frame.x + mapping.frame.width - x[0],
      mapping.frame.y + mapping.frame.height - y[0]
    ),
  };
  const center = {
    x: mapping.frame.x + mapping.frame.width / 2,
    y: mapping.frame.y + mapping.frame.height / 2,
  };
  const angle = (mapping.frame.rotation * Math.PI) / 180;
  const dx = subtract(x, [center.x, center.x]),
    dy = subtract(y, [center.y, center.y]);
  const rotatedX = subtract(multiply(dx, Math.cos(angle)), multiply(dy, Math.sin(angle)));
  const rotatedY = sum(multiply(dx, Math.sin(angle)), multiply(dy, Math.cos(angle)));
  return { center, rotatedX, rotatedY, raster };
}

function sourceVisualLayerBounds(
  clip: VideoProject['clips'][number],
  transitions: readonly ReturnType<typeof buildProjectTransitionSegments>[number][],
  stateAt: (time: number) => ReturnType<typeof resolveTransitionVisualStateForRole>,
  start: number,
  end: number
) {
  const middle = (start + end) / 2;
  const transition = transitions.find(
    (item) =>
      middle >= item.start &&
      (middle < item.end || (middle === item.end && middle === clip.startTime + clip.duration))
  );
  const states = [stateAt(middle)];
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
        states.push(resolveTransitionVisualStateForRole(clip, role, transition, progress));
      }
    }
    if (Math.min(...progressValues) <= 0.5 && Math.max(...progressValues) >= 0.5)
      states.push(resolveTransitionVisualStateForRole(clip, role, transition, 0.5));
  }
  const bounds = (key: 'translateX' | 'translateY' | 'scaleX' | 'scaleY'): Range => [
    Math.min(...states.map((state) => state[key])),
    Math.max(...states.map((state) => state[key])),
  ];
  return {
    translateX: bounds('translateX'),
    translateY: bounds('translateY'),
    scaleX: bounds('scaleX'),
    scaleY: bounds('scaleY'),
  };
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
  const phase = nominalPhase(input.region, input.connectedIn, input.connectedOut);
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
  const stateAt = (clipId: string, time: number) => {
    const clip = clips.get(clipId);
    const transition = transitionsByClip
      .get(clipId)
      ?.find(
        (item) =>
          time >= item.start &&
          (time < item.end ||
            (time === item.end && clip && time === clip.startTime + clip.duration))
      );
    if (!clip || !transition) return IDENTITY_TRANSITION_VISUAL_STATE;
    const progress = time === transition.end ? 1 : getTransitionProgress(transition, time);
    return progress === null
      ? IDENTITY_TRANSITION_VISUAL_STATE
      : resolveTransitionVisualStateForRole(
          clip,
          transition.leadingClipId === clipId ? 'leading' : 'trailing',
          transition,
          progress
        );
  };
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
    const mapping = mappings.get(clipId);
    if (!mapping) return null;
    const mapped = mapCursorFocusControlPoint(
      { ...mapping, renderState: stateAt(clipId, time) },
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
    const nativeX: Range = [
      Math.min(actual.from.x, actual.to.x),
      Math.max(actual.from.x, actual.to.x),
    ];
    const nativeY: Range = [
      Math.min(actual.from.y, actual.to.y),
      Math.max(actual.from.y, actual.to.y),
    ];
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
    const { center, rotatedX, rotatedY, raster } = nativeSourceRasterBounds(
      mapping,
      nativeX,
      nativeY
    );
    const visual = sourceVisualLayerBounds(
      clip,
      transitionsByClip.get(clipId) ?? [],
      (time) => stateAt(clipId, time),
      start,
      end
    );
    if (!visual) return null;
    const layerX = visual.scaleX,
      layerY = visual.scaleY;
    return {
      x: multiply(
        sum(sum([center.x, center.x], visual.translateX), product(layerX, rotatedX)),
        scaleX
      ),
      y: multiply(
        sum(sum([center.y, center.y], visual.translateY), product(layerY, rotatedY)),
        scaleY
      ),
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
      ...(project.cursorTrack?.samples ?? []).map((sample) => sample.time),
    ],
    panDomain: domain,
    preferredPan(frame, scale) {
      const point = worldPoint(frame, frame.segmentId, frame.time);
      return point
        ? {
            x: transform.offsetX + point.x * scale - output.width / 2,
            y: transform.offsetY + point.y * scale - output.height / 2,
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
      const zoom = 1 + (scale - 1) * progress;
      const mx = output.width * marginFraction,
        my = output.height * marginFraction;
      return {
        minX: Math.max(0, (transform.offsetX + zoom * point.x - output.width + mx) / progress),
        maxX: Math.min(bounds.maxX, (transform.offsetX + zoom * point.x - mx) / progress),
        minY: Math.max(0, (transform.offsetY + zoom * point.y - output.height + my) / progress),
        maxY: Math.min(bounds.maxY, (transform.offsetY + zoom * point.y - my) / progress),
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
      return {
        ...result,
        raster: { low: raster[0], high: raster[1] },
        viewport: {
          low: Math.min(x[0], y[0], output.width - x[1], output.height - y[1]),
          high: Math.min(x[1], y[1], output.width - x[0], output.height - y[0]),
        },
      };
    },
    motionBounds({ start, end, trajectory, pan, targetScale }) {
      const curve = phase.at((start + end) / 2);
      const g = [0, 1, 2, 3].map((order) =>
        scalarBounds(curve, start, end, order === 0 ? 0 : order === 1 ? 1 : order === 2 ? 2 : 3)
      );
      const axis = (size: number, axis: 'x' | 'y') => {
        const p: Range[] = [axis === 'x' ? [pan.minX, pan.maxX] : [pan.minY, pan.maxY]];
        for (const order of [1, 2, 3] as const) {
          const bounds = trajectory ? cameraTrajectoryBounds(trajectory, start, end, order) : null;
          p.push(
            bounds
              ? axis === 'x'
                ? [bounds.minX, bounds.maxX]
                : [bounds.minY, bounds.maxY]
              : [0, 0]
          );
        }
        const offset = subtract([0, (targetScale - 1) * size], p[0]!);
        return [
          subtract(product(g[1]!, offset), product(g[0]!, p[1]!)),
          subtract(
            subtract(product(g[2]!, offset), multiply(product(g[1]!, p[1]!), 2)),
            product(g[0]!, p[2]!)
          ),
          subtract(
            subtract(
              subtract(product(g[3]!, offset), multiply(product(g[2]!, p[1]!), 3)),
              multiply(product(g[1]!, p[2]!), 3)
            ),
            product(g[0]!, p[3]!)
          ),
        ];
      };
      const x = axis(window.width, 'x'),
        y = axis(window.height, 'y');
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
