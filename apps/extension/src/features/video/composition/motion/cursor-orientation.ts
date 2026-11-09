import {
  preparedProjectCamera,
  projectCameraGeometryKey,
  type CursorOrientationPlan,
} from './prepared-project-camera';
export type { CursorOrientationPlan } from './prepared-project-camera';
import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';
import {
  resolveMotionWindowCameraParts,
  resolveMotionWindowCameraRegion,
} from '../../project/motion/source-binding';
import { motionTransitionSettings } from '../../project/motion/timing';
import { getSourceTimedClipProjectOffset } from '../../project/timeline/rate';
import { createCursorResponse, compileCursorResponse } from './cursor-response';
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
  resolveObservedCursorPosition,
  mapCursorFocusControlPoint,
} from '../timeline/frame/cursor';
import type { CursorCompositionSettings } from '../../project/motion/spatial';
import { hasCursorComposition, cameraPerspectiveWithCursor } from '../../project/motion/spatial';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import {
  createCameraTrajectory,
  evaluateCameraTrajectory,
  type CameraTrajectory,
  type CameraPanPoint,
} from './camera-trajectory';

interface CursorOrientationObservation extends CameraPanPoint {
  time: number;
  segmentId?: string;
}

/** Disposable cursor-only phase; nominal zoom and authored manual perspective keep their own clocks. */
export function createCursorActivationPlan(input: {
  start: number;
  end: number;
  enterDuration: number;
  exitDuration: number;
  connectedIn?: boolean;
  connectedOut?: boolean;
  amount?: number | undefined;
  movementDuration?: number | undefined;
}) {
  // Activation obeys the same movement budget as follow admission, including projective cross terms.
  const minimumDuration =
    Math.max(0.3, input.movementDuration ?? 0) * Math.max(1, 2 * (input.amount ?? 0.5));
  const duration = (value: number) =>
    value > 0 ? Math.min((input.end - input.start) / 2, Math.max(minimumDuration, value)) : 0;
  const enterDuration = input.connectedIn ? 0 : duration(input.enterDuration);
  const exitDuration = input.connectedOut ? 0 : duration(input.exitDuration);
  const enter =
    enterDuration > 0
      ? createCameraTrajectory({
          start: input.start,
          end: input.start + enterDuration,
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
        })
      : undefined;
  const exit =
    exitDuration > 0
      ? createCameraTrajectory({
          start: input.end - exitDuration,
          end: input.end,
          from: { x: 1, y: 0 },
          to: { x: 0, y: 0 },
        })
      : undefined;
  return {
    enter,
    exit,
    breaks: [...(enter ? [enter.start, enter.end] : []), ...(exit ? [exit.start, exit.end] : [])],
  };
}

/** A proof cell selects the same activation polynomial that absolute rendering evaluates. */
export function cursorActivationAt(
  plan: ReturnType<typeof createCursorActivationPlan>,
  time: number
): number | CameraTrajectory {
  if (plan.enter && time < plan.enter.end) return time < plan.enter.start ? 0 : plan.enter;
  if (plan.exit && time > plan.exit.start) return time > plan.exit.end ? 0 : plan.exit;
  return 1;
}

/** Exact output-clock activation value; no state survives a seek. */
export function evaluateCursorActivation(
  plan: ReturnType<typeof createCursorActivationPlan>,
  time: number
) {
  const phase = cursorActivationAt(plan, time);
  return typeof phase === 'number' ? phase : evaluateCameraTrajectory(phase, time).x;
}

function projectCursorClockRange(project: VideoProject, region: VideoProjectMotionRegion) {
  if (region.sourceBinding?.coordinateSpace === 'source-window') {
    const normalized = resolveMotionWindowCameraRegion(project, region);
    return { start: normalized.startTime, end: normalized.startTime + normalized.duration };
  }
  const start = region.startTime - (region.animation?.start ?? 0);
  return { start, end: start + (region.animation?.duration ?? region.duration) };
}

/** Source projections retain the complete camera animation clock across clip slices. */
export function projectCursorActivationPlan(
  project: VideoProject,
  region: VideoProjectMotionRegion
) {
  const { start, end } = projectCursorClockRange(project, region);
  const group = region.sourceBinding?.animationGroupId;
  const members =
    region.sourceBinding?.coordinateSpace === 'source-window'
      ? resolveMotionWindowCameraParts(project, region)
      : (project.motionRegions ?? []).filter(
          (item) =>
            item.id === region.id || (group && item.sourceBinding?.animationGroupId === group)
        );
  const ids = new Set(members.map((item) => item.id));
  const policy = resolveCameraFollowPolicy({
    ...(project.cameraFollowDefaults ? { defaults: project.cameraFollowDefaults } : {}),
    ...(region.cameraFollow ? { override: region.cameraFollow } : {}),
  });
  return createCursorActivationPlan({
    start,
    end,
    amount: region.cursorComposition?.amount,
    movementDuration: policy.settings.transitionDuration,
    enterDuration: motionTransitionSettings(region, 'enter').duration,
    exitDuration: motionTransitionSettings(region, 'exit').duration,
    connectedIn: members.some(
      (item) => item.incomingConnection && !ids.has(item.incomingConnection.fromRegionId)
    ),
    connectedOut: (project.motionRegions ?? []).some(
      (item) => item.incomingConnection && ids.has(item.incomingConnection.fromRegionId)
    ),
  });
}

/** Compile the position-driven response once, independently of camera activation and pan planning. */
export function createCursorOrientationPlan(input: {
  settings: CursorCompositionSettings;
  observations: readonly CursorOrientationObservation[];
  start: number;
  end: number;
}): CursorOrientationPlan | undefined {
  if (!hasCursorComposition(input.settings) || input.end <= input.start) return undefined;
  const { settings } = input;
  const gain = settings.amount / 0.5;
  const fixed = settings.mode === 'left' || settings.mode === 'right';
  const observations = fixed
    ? [{ time: input.start, x: -12 * gain, y: (settings.mode === 'left' ? -18 : 18) * gain }]
    : input.observations
        .filter(
          (point) =>
            Number.isFinite(point.time) && Number.isFinite(point.x) && Number.isFinite(point.y)
        )
        .map((point) => ({
          ...point,
          x: (-4 + 24 * (Math.max(0, Math.min(1, point.y)) - 0.5)) * gain,
          y: -44 * (Math.max(0, Math.min(1, point.x)) - 0.5) * gain,
        }));
  if (!observations.length) observations.push({ time: input.start, x: -4 * gain, y: 0 });
  const response = createCursorResponse(observations, 8 - 5 * settings.smoothness);
  const spans = compileCursorResponse(response, input.start, input.end);
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
    plan.spans.findLast((span) => start >= span.start && end <= span.end) ??
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
  const bundle = preparedProjectCamera(project);
  const prepared = bundle?.orientations.find(
    (item) => item.key === projectCameraGeometryKey(project, region)
  );
  if (bundle && !prepared && region.duration > 0 && !region.sourceBinding?.dormant)
    throw new Error('Prepared camera orientation is unavailable.');
  if (prepared) return prepared.plan;
  const { start, end } = projectCursorClockRange(project, region);
  const key = JSON.stringify({
    settings: region.cursorComposition,
    clipId: region.sourceBinding?.clipId,
    coordinateSpace: region.sourceBinding?.coordinateSpace,
    start,
    end,
  });
  let plans = projectPlans.get(project);
  if (!plans) {
    plans = new Map();
    projectPlans.set(project, plans);
  }
  if (plans.has(key)) return plans.get(key);
  const clipId = region.sourceBinding?.clipId;
  const times = new Set((project.cursorTrack?.samples ?? []).map((sample) => sample.time));
  const clips = project.clips.filter(
    (clip) => clip.type === 'VIDEO' && (!clipId || clip.id === clipId)
  );
  for (const clip of clips) {
    if (clip.type !== 'VIDEO') continue;
    times.add(clip.startTime);
    times.add(clip.startTime + clip.duration);
    const group = project.cursorTrack?.sourceObservations?.find(
      (group) => group.sourceInstanceId === clip.sourceInstanceId
    );
    for (const sample of group?.samples ?? []) {
      const time =
        clip.startTime + getSourceTimedClipProjectOffset(clip, sample.time - clip.sourceStart);
      if (time >= clip.startTime && time <= clip.startTime + clip.duration) times.add(time);
    }
    if (group?.trajectory && !group.samples.length)
      for (let time = clip.startTime; time < clip.startTime + clip.duration; time += 1 / 30)
        times.add(time);
  }
  let visit = 0,
    covered = false;
  const observations = [...times]
    .filter((time) => time >= 0 && time <= project.duration)
    .sort((a, b) => a - b)
    .flatMap((time) => {
      const owner =
        clips.find((clip) => time >= clip.startTime && time < clip.startTime + clip.duration) ??
        clips.findLast((clip) => time === clip.startTime + clip.duration);
      const point =
        resolveObservedCursorPosition(project, time, clipId ?? owner?.id, {
          includeSourceEnd: true,
        }) ?? (!clipId ? resolveObservedCursorPosition(project, time) : null);
      if (!point) {
        if (covered) visit++;
        covered = false;
        return [];
      }
      covered = true;
      const native = point.recordingPoint ?? {
        x: point.x / project.width,
        y: point.y / project.height,
      };
      const mapping = resolveCursorSourcePointMapping(
        project,
        clipId ?? point.sourceAnchor?.sourceClipId,
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
      const sourceIdentity = point.sourceAnchor?.sourceClipId ?? clipId ?? 'project';
      return [
        {
          time,
          ...normalized,
          segmentId: `${sourceIdentity}:${point.captureSegment ?? ''}:${visit}`,
        },
      ];
    });
  const plan = createCursorOrientationPlan({
    settings: region.cursorComposition!,
    observations,
    start,
    end,
  });
  if (plan)
    plan.breaks = [
      ...new Set([
        ...plan.breaks,
        ...(project.motionRegions ?? [])
          .filter(
            (item) => item.focusMode === 'CURSOR' && hasCursorComposition(item.cursorComposition)
          )
          .flatMap((item) => projectCursorActivationPlan(project, item).breaks),
      ]),
    ].sort((a, b) => a - b);
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
  const maximumRadius = 0.12 + settings.smoothness * 0.48;
  let low = 0;
  let runStart = 0;
  let runEnd = -1;
  return frames.map((frame, index) => {
    if (index > runEnd) {
      runStart = index;
      runEnd = index;
      while (runEnd + 1 < frames.length && frames[runEnd + 1]!.segmentId === frame.segmentId)
        runEnd++;
    }
    // Truncated symmetric windows must not move a capture endpoint toward future activity.
    const radius = Math.min(
      maximumRadius,
      frame.time - frames[runStart]!.time,
      frames[runEnd]!.time - frame.time
    );
    if (radius <= 0 || (frame.preferenceWeight ?? 1) > 1) return frame;
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
  activationPlan?: ReturnType<typeof createCursorActivationPlan>;
}) {
  const { region, window, orientationPlan, activationPlan } = input;
  const effective = orientationPlan ? cameraPerspectiveWithCursor(region, { x: 0, y: 0 }) : region;
  const pose = effective.perspective;
  const perspective =
    pose && ((orientationPlan && pose.enabled) || hasQuickEditPerspective(pose))
      ? {
          rotateX: pose.rotateX,
          rotateY: pose.rotateY,
          rotateZ: ((pose.rotateZ + 540) % 360) - 180,
          strength: pose.strength,
        }
      : { rotateX: 0, rotateY: 0, rotateZ: 0, strength: 0 };
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
          {
            from: false,
            to: !!orientationPlan,
            ...(activationPlan ? { progress: evaluateCursorActivation(activationPlan, time) } : {}),
          }
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
    progress,
    hasCursorComposition(region.cursorComposition)
      ? evaluateCursorActivation(projectCursorActivationPlan(project, region), time)
      : undefined
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
  const activationPlan = orientationPlan ? projectCursorActivationPlan(project, region) : undefined;
  const ref = region.spatialReference ?? { x: 0, y: 0, width: 1, height: 1 };
  const reference = {
    x: ref.x * window.width,
    y: ref.y * window.height,
    width: ref.width * window.width,
    height: ref.height * window.height,
  };
  const effective = orientationPlan ? cameraPerspectiveWithCursor(region, { x: 0, y: 0 }) : region;
  const perspective =
    (orientationPlan && effective.perspective?.enabled) ||
    hasQuickEditPerspective(effective.perspective)
      ? effective.perspective
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
      progress,
      activationPlan ? evaluateCursorActivation(activationPlan, time) : undefined
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
        ...(orbit
          ? {
              orbit: {
                angles: orbit,
                ...(activationPlan
                  ? { phase: cursorActivationAt(activationPlan, (start + end) / 2) }
                  : {}),
              },
            }
          : {}),
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
