import { evaluateMotionSpatial } from './spatial';
import {
  quickEditPlaneProjection,
  projectQuickEditPoint,
  type QuickEditHomography,
} from './spatial-geometry';
import { boundCameraPlaneProjection } from './spatial-projection-bounds';
import type { WorkingZoneCameraGeometry } from './follow-cursor';
import type { CameraSpatialSettings, CameraSpatialRect } from '../../project/motion/spatial';
import {
  resolveCameraWindowWeight,
  hasCameraPerspective as hasQuickEditPerspective,
  interpolateCameraSpatial as interpolateQuickEditSpatial,
} from '../../project/motion/spatial';
import { getFittedMediaContentFrame, getFittedMediaWindowFrame } from '../draw/fitted-media';
import {
  resolveCursorSourcePointMapping,
  mapCursorFocusControlPoint,
} from '../timeline/frame/cursor';
import type { CursorCompositionSettings } from '../../project/motion/spatial';
import { hasCursorComposition, cameraPerspectiveWithCursor } from '../../project/motion/spatial';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import {
  resolveProjectCursorFocusSamples,
  resolveProjectCursorFocusPath,
  resolveProjectCursorFocus,
} from '../../project/cursor-focus-path/projection';
import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  type CameraTrajectory,
  type CameraPanPoint,
} from './camera-trajectory';

/** Disposable output-clock Euler offsets; every span has continuous position and two derivatives. */
export interface CursorOrientationPlan {
  spans: readonly CameraTrajectory[];
  breaks: readonly number[];
}
interface CursorOrientationObservation extends CameraPanPoint {
  time: number;
  segmentId?: string;
}

/** Cursor targets use a finite observation window without joining separate captured segments. */
function cursorOrientationTarget(
  points: readonly CursorOrientationObservation[],
  settings: CursorCompositionSettings,
  step: number
) {
  const observations = points
    .filter(
      (point) => Number.isFinite(point.time) && Number.isFinite(point.x) && Number.isFinite(point.y)
    )
    .toSorted((a, b) => a.time - b.time);
  const lowerBound = (time: number) => {
    let low = 0,
      high = observations.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (observations[mid]!.time < time) low = mid + 1;
      else high = mid;
    }
    return low;
  };
  return (time: number): CameraPanPoint => {
    let x = 0,
      y = 0,
      total = 0;
    const center = Math.min(observations.length - 1, lowerBound(time));
    const segmentId = observations[center]?.segmentId;
    for (
      let index = lowerBound(time - step);
      index < observations.length && observations[index]!.time <= time + step;
      index++
    ) {
      const point = observations[index]!;
      if (point.segmentId !== segmentId) continue;
      const distance = Math.abs(point.time - time);
      if (distance > step) continue;
      const weight = 1 - distance / step;
      x += point.x * weight;
      y += point.y * weight;
      total += weight;
    }
    if (total > 0) {
      x /= total;
      y /= total;
    } else {
      const held = observations[Math.max(0, lowerBound(time) - 1)];
      x = held?.x ?? 0.5;
      y = held?.y ?? 0.5;
    }
    const unit = (value: number) => Math.max(-1, Math.min(1, 2 * value - 1));
    const pitch = -unit(y) * 8 * settings.amount;
    const yaw =
      (settings.mode === 'left' ? -1 : settings.mode === 'right' ? 1 : unit(x)) *
      12 *
      settings.amount;
    return { x: pitch, y: yaw };
  };
}

/** Precompute cursor-only orientation before pan admission; no camera pose feeds this curve. */
export function createCursorOrientationPlan(input: {
  settings: CursorCompositionSettings;
  observations: readonly CursorOrientationObservation[];
  start: number;
  end: number;
}): CursorOrientationPlan | undefined {
  if (!hasCursorComposition(input.settings) || input.end <= input.start) return undefined;
  const { settings } = input;
  const step = 0.25 + settings.smoothness * 0.75;
  const target = cursorOrientationTarget(input.observations, settings, step);
  const count = Math.max(1, Math.ceil((input.end - input.start) / step));
  const stepSize = (input.end - input.start) / count;
  const targets = Array.from({ length: count + 1 }, (_, index) =>
    target(input.start + index * stepSize)
  );
  const velocities = targets.map((point, index) => {
    if (index === 0 || index === targets.length - 1) return { x: 0, y: 0 };
    const axis = (axis: 'x' | 'y') => {
      const left = (point[axis] - targets[index - 1]![axis]) / stepSize;
      const right = (targets[index + 1]![axis] - point[axis]) / stepSize;
      return left * right > 0 ? (2 * left * right) / (left + right) : 0;
    };
    return { x: axis('x'), y: axis('y') };
  });
  const spans: CameraTrajectory[] = [];
  for (let index = 0; index < count; index++) {
    const start = input.start + stepSize * index;
    const end = index === count - 1 ? input.end : input.start + stepSize * (index + 1);
    spans.push(
      createCameraTrajectory({
        start,
        end,
        from: targets[index]!,
        to: targets[index + 1]!,
        fromVelocity: velocities[index]!,
        toVelocity: velocities[index + 1]!,
      })
    );
  }
  return { spans, breaks: [input.start, ...spans.map((span) => span.end)] };
}

/** Select one polynomial only after the admission cell has split at every orientation boundary. */
export function cursorOrientationInterval(
  plan: CursorOrientationPlan | undefined,
  start: number,
  end: number
) {
  if (!plan) return undefined;
  if (plan.breaks.some((time) => start < time && time < end)) return null;
  return (
    plan.spans.find((span) => start >= span.start && end <= span.end) ??
    (end <= plan.spans[0]!.start ? plan.spans[0] : plan.spans.at(-1))
  );
}

/** Absolute evaluation is shared by scrubbing, playback, and export. */
export function evaluateCursorOrientation(
  plan: CursorOrientationPlan | undefined,
  time: number
): CameraPanPoint {
  if (!plan) return { x: 0, y: 0 };
  const span = plan.spans.findLast((span) => span.start <= time) ?? plan.spans[0]!;
  return evaluateCameraTrajectory(span, time);
}

const projectPlans = new WeakMap<VideoProject, Map<string, CursorOrientationPlan | undefined>>();
/** Source key projection already owns trim, rate, and retained source-instance clocks. */
export function resolveProjectCursorOrientation(
  project: VideoProject,
  region: VideoProjectMotionRegion
) {
  if (region.focusMode !== 'CURSOR' || !hasCursorComposition(region.cursorComposition))
    return undefined;
  const key = JSON.stringify({
    settings: region.cursorComposition,
    clipId: region.sourceBinding?.clipId,
    coordinateSpace: region.sourceBinding?.coordinateSpace,
  });
  let plans = projectPlans.get(project);
  if (!plans) {
    plans = new Map();
    projectPlans.set(project, plans);
  }
  if (plans.has(key)) return plans.get(key);
  const path = resolveProjectCursorFocusPath(project);
  const times = new Set(
    resolveProjectCursorFocusSamples(project, true).map((sample) => sample.time)
  );
  const step = Math.max(1 / 30, project.duration / 18000);
  for (let time = 0; time < project.duration; time += step) times.add(time);
  times.add(project.duration);
  const observations = [...times]
    .sort((a, b) => a - b)
    .flatMap((time) => {
      const point = resolveProjectCursorFocus(project, time, path, region.sourceBinding?.clipId);
      if (!point) return [];
      const native = { x: point.x / project.width, y: point.y / project.height };
      const mapping = resolveCursorSourcePointMapping(
        project,
        region.sourceBinding?.clipId ?? point.sourceClipId,
        time
      );
      let normalized = native;
      if (mapping && region.sourceBinding?.coordinateSpace === 'source-window') {
        const content = getFittedMediaContentFrame(mapping),
          window = getFittedMediaWindowFrame(mapping);
        normalized = {
          x: (content.x + native.x * content.width - window.x) / window.width,
          y: (content.y + native.y * content.height - window.y) / window.height,
        };
      } else if (mapping) {
        const projected = mapCursorFocusControlPoint(mapping, native);
        normalized = { x: projected.x / project.width, y: projected.y / project.height };
      }
      return [{ time, ...normalized, segmentId: point.segmentId }];
    });
  const plan = createCursorOrientationPlan({
    settings: region.cursorComposition!,
    observations,
    start: 0,
    end: project.duration,
  });
  plans.set(key, plan);
  return plan;
}

/** Decorate a Native target with its independently planned cursor pose at an exact output time. */
export function projectCursorSpatialSettings(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number,
  base = false
): VideoProjectMotionRegion {
  const plan = resolveProjectCursorOrientation(project, region);
  if (region.focusMode !== 'CURSOR' || !region.cursorComposition) return region;
  const { perspective: _perspective, depthOfField: _depth, ...retained } = region;
  return {
    ...retained,
    ...cameraPerspectiveWithCursor(
      region,
      base ? { x: 0, y: 0 } : evaluateCursorOrientation(plan, time)
    ),
  };
}

/** Smooth framing preferences only; confirmed pointer constraints and manually weighted focus remain exact. */
export function smoothCursorCameraPreferences<
  T extends CursorOrientationObservation & { segmentId: string; preferenceWeight?: number },
>(frames: readonly T[], settings: CursorCompositionSettings | undefined): T[] {
  if (!settings || settings.smoothness === 0) return [...frames];
  const radius = 0.12 + settings.smoothness * 0.48;
  let low = 0;
  return frames.map((frame, index) => {
    if ((frame.preferenceWeight ?? 1) > 1) return frame;
    while (low < index && frames[low]!.time < frame.time - radius) low++;
    let x = 0,
      y = 0,
      sum = 0;
    for (
      let cursor = low;
      cursor < frames.length && frames[cursor]!.time <= frame.time + radius;
      cursor++
    ) {
      const nearby = frames[cursor]!;
      if (nearby.segmentId !== frame.segmentId || (nearby.preferenceWeight ?? 1) > 1) continue;
      const distance = Math.abs(nearby.time - frame.time) / radius;
      // Finite symmetric critically damped weights remove phase lag and preserve random access.
      const weight = (1 + 4 * distance) * Math.exp(-4 * distance) * (1 - distance) ** 2;
      x += nearby.x * weight;
      y += nearby.y * weight;
      sum += weight;
    }
    return sum > 0 ? { ...frame, x: x / sum, y: y / sum } : frame;
  });
}

/** Source-window projection caches include the independent cursor clock as well as nominal phase. */
export function createWindowCursorProjection(input: {
  region: CameraSpatialSettings;
  window: CameraSpatialRect;
  orientationPlan?: CursorOrientationPlan;
}) {
  const { region, window, orientationPlan } = input;
  const perspective =
    (orientationPlan && region.perspective?.enabled) || hasQuickEditPerspective(region.perspective)
      ? {
          rotateX: region.perspective.rotateX,
          rotateY: region.perspective.rotateY,
          rotateZ: ((region.perspective.rotateZ + 540) % 360) - 180,
          strength: region.perspective.strength,
        }
      : { rotateX: 0, rotateY: 0, rotateZ: 0, strength: orientationPlan ? 0.5 : 0 };
  const projections = new Map<string, QuickEditHomography>();
  const at = (progress: number, scale: number, time: number) => {
    const key = `${progress}:${scale}:${orientationPlan ? time : 0}`;
    let projection = projections.get(key);
    if (!projection) {
      projection = quickEditPlaneProjection(
        window,
        { ...window, width: window.width * scale, height: window.height * scale },
        interpolateQuickEditSpatial(
          null,
          orientationPlan
            ? cameraPerspectiveWithCursor(region, evaluateCursorOrientation(orientationPlan, time))
            : region,
          progress,
          { from: false, to: !!orientationPlan }
        )
      );
      projections.set(key, projection);
      if (projections.size > 32) projections.delete(projections.keys().next().value ?? '');
    }
    return projection;
  };
  return { perspective, at };
}

/** Native renderer adapter evaluates the cursor target before applying the authored camera phase. */
export function projectCursorSpatial(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number,
  progress: number
) {
  return evaluateMotionSpatial(
    project,
    null,
    projectCursorSpatialSettings(project, region, time),
    progress
  );
}

/** Frozen link endpoints use the same effective cursor pose and activation as their renderer. */
function projectCursorLinkEndpoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number
) {
  const plan = resolveProjectCursorOrientation(project, region);
  const { perspective } = projectCursorSpatialSettings(project, region, time, true);
  return {
    spatial: hasQuickEditPerspective(perspective) || !!plan,
    settings: {
      ...(perspective ? { perspective } : {}),
      ...(plan ? { cursorOffset: evaluateCursorOrientation(plan, time) } : {}),
    },
  };
}

/** Native scene-plane cursor projection supplies the same pose to preferred framing and interval admission. */
export function createProjectCursorProjection(input: {
  project: VideoProject;
  region: VideoProjectMotionRegion;
  orientationPlan?: CursorOrientationPlan | undefined;
  window: { width: number; height: number };
  output: { width: number; height: number };
  offset: { x: number; y: number };
  phaseAt(time: number): number | CameraTrajectory;
}) {
  const { project, region, orientationPlan, window, output, offset, phaseAt } = input;
  const ref = region.spatialReference ?? { x: 0, y: 0, width: 1, height: 1 };
  const reference = {
    x: ref.x * window.width,
    y: ref.y * window.height,
    width: ref.width * window.width,
    height: ref.height * window.height,
  };
  const perspective =
    (orientationPlan && region.perspective?.enabled) || hasQuickEditPerspective(region.perspective)
      ? region.perspective
      : orientationPlan
        ? { enabled: true, rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0.5 }
        : null;
  const projectPoint = (
    point: CameraPanPoint,
    targetScale: number,
    progress: number,
    time: number
  ) => {
    if (!perspective)
      return {
        x: point.x * (1 + (targetScale - 1) * progress),
        y: point.y * (1 + (targetScale - 1) * progress),
      };
    const spatial = evaluateMotionSpatial(
      project,
      null,
      projectCursorSpatialSettings(project, region, time),
      progress
    )!;
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
  return {
    perspective,
    reference,
    projectPoint,
    motionBounds({
      start,
      end,
      trajectory,
      pan,
      targetScale,
    }: Parameters<WorkingZoneCameraGeometry['motionBounds']>[0]) {
      if (!orientationPlan || !perspective) return undefined;
      const orbit = cursorOrientationInterval(orientationPlan, start, end);
      if (orbit === null) return null;
      return boundCameraPlaneProjection({
        start,
        end,
        phase: phaseAt((start + end) / 2),
        targetScale,
        pan,
        perspective,
        ...(orbit ? { orbit: { angles: orbit } } : {}),
        ...(trajectory ? { trajectory } : {}),
        motion: true,
        reference,
        source: { x: [0, window.width], y: [0, window.height] },
        output,
        offset,
      });
    },
  };
}

/** Resolve linked decorated-window policy from the effective spatial settings at both frozen endpoints. */
export function projectCursorLinkSettings(
  project: VideoProject,
  source: VideoProjectMotionRegion,
  destination: VideoProjectMotionRegion,
  start: number,
  end: number
) {
  const from = projectCursorLinkEndpoint(project, source, start);
  const to = projectCursorLinkEndpoint(project, destination, end);
  const background = project.sceneBackground;
  return {
    from: from.settings,
    to: to.settings,
    windowWeight: resolveCameraWindowWeight(
      background?.zoomBehavior ?? 'window',
      background?.enabled !== false &&
        background?.zoomBehavior === 'follow-video' &&
        !from.spatial &&
        !to.spatial,
      from.spatial || to.spatial
    ),
  };
}
