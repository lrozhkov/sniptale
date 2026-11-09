export type { ProjectCameraConflict } from './prepared-project-camera';
import {
  preparedProjectCamera,
  projectCameraGeometryKey,
  projectCameraOutputKey,
  type PreparedProjectCamera,
  type ProjectCameraConflict,
} from './prepared-project-camera';
import { projectCursorLinkSettings, smoothCursorCameraPreferences } from './cursor-orientation';
import { VIDEO_PROJECT_ATTACHMENT_GEOMETRY } from '../../project/types/export';
import type { VideoProjectRenderScope } from '../../project/export/render-scope';
import { motionFocusAreaPoint } from '../../project/motion/focus-area';
import { resolveManualMotionFocusPoint, resolveMotionTargetScale } from './focus-target';
import { motionTransitionTypeForEasing } from '../../project/motion/timing';
import { resolveProjectOutputTransform } from '../../project/export/output-dimensions';
import {
  createWindowCameraLinkGeometry,
  planWindowCameraGap,
  type WindowCameraLinkFit,
  cropWindowCameraObservations,
} from './window-camera-geometry';
import { resolveMotionSourceWindow, motionWindowFocusToWindow } from './source-window';
import {
  projectMotionSourcePhases,
  resolveMotionWindowCameraParts,
  resolveMotionWindowCameraRegion,
} from '../../project/motion/source-binding';
import { resolveMotionSourcePlayback } from '../../project/motion/source-playback';
import { isCameraMotionRegion } from '../../project/motion/normalization';
import { cameraSourceGeometryBreaks } from './camera-source-geometry';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import {
  resolveProjectCursorFocusPath,
  resolveProjectCursorFocus,
  resolveProjectCursorFocusSamples,
} from '../../project/cursor-focus-path/projection';
import {
  resolveMotionConnectionSource,
  resolveMotionConnectionVideo,
  resolveMotionConnectionEdges,
} from '../../project/motion';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import { VideoCursorCaptureMode } from '../../project/types';
import { cursorFocusPreferenceWeight } from '../../project/cursor-focus-path/evaluator';
import { VideoMotionFocusMode } from '../../project/types';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import { resolveCameraFollowPolicy } from '../../project/camera/cursor-policy';
import {
  resolveObservedCursorPosition,
  resolveCursorSample,
  resolveVideoCompositionCursor,
} from '../timeline/frame/cursor';
import {
  createProjectWorkingZoneCameraGeometry,
  createProjectWindowPlaneProjection,
} from './camera-geometry';
import type { ProjectCameraSourceBinding } from './camera-geometry';
import {
  planWorkingZoneCamera,
  evaluateWorkingZoneCamera,
  evaluateWorkingZoneCameraBoundary,
} from './follow-cursor';
import { resolveCameraViewportFrame } from './viewport';
import type {
  CameraBoundaryState,
  WorkingZoneCameraBoundaries,
  FollowCursorFrame,
  WorkingZoneCameraPlan,
  WorkingZoneCameraGeometry,
} from './follow-cursor';

interface ProjectCameraPlanEntry {
  signature: string;
  plan: WorkingZoneCameraPlan;
  geometry: WorkingZoneCameraGeometry;
  input: Parameters<typeof planWorkingZoneCamera>[0];
  links?: Map<string, { conflict: ProjectCameraConflict | null; fit?: WindowCameraLinkFit }>;
}
const plans = new WeakMap<VideoProject, Map<string, ProjectCameraPlanEntry>>();

/** Split animation parts share the existing camera-connection topology. */
export function resolveProjectCameraEdges(project: VideoProject, region: VideoProjectMotionRegion) {
  return resolveMotionConnectionEdges(project, region);
}

type ProjectCameraPreference = { x: number; y: number; segmentId: string; sourceClipId?: string };
function projectCameraFrameAtTime(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  path: ReturnType<typeof resolveProjectCursorFocusPath>,
  time: number,
  previousFocus: ProjectCameraPreference | undefined,
  clipId = region.sourceBinding?.clipId
) {
  const focus = resolveProjectCursorFocus(project, time, path, clipId);
  const rendered = project.cursorTrack?.captureMode === VideoCursorCaptureMode.SEPARATE;
  const cursor = rendered ? resolveVideoCompositionCursor(project, time, []) : null;
  const renderedSample = rendered ? resolveCursorSample(project, time) : null;
  const nativeCursor = renderedSample?.sourceAnchor !== undefined;
  const sample = rendered ? renderedSample : resolveObservedCursorPosition(project, time, clipId);
  const actual =
    rendered && nativeCursor
      ? cursor && sample?.recordingPoint
        ? sample.recordingPoint
        : undefined
      : cursor
        ? { x: cursor.x / project.width, y: cursor.y / project.height }
        : !rendered && sample
          ? (sample.recordingPoint ?? { x: sample.x / project.width, y: sample.y / project.height })
          : undefined;
  const heldClipId = previousFocus?.sourceClipId;
  const owner = heldClipId && project.clips.find((clip) => clip.id === heldClipId);
  const held =
    previousFocus &&
    (!owner || (time >= owner.startTime && time < owner.startTime + owner.duration))
      ? previousFocus
      : undefined;
  const preferred = focus
    ? {
        x: focus.x / project.width,
        y: focus.y / project.height,
        segmentId:
          region.sourceBinding?.coordinateSpace === 'source-window' ? focus.id : focus.segmentId,
        ...(focus.sourceClipId ? { sourceClipId: focus.sourceClipId } : {}),
      }
    : held;
  if (!preferred && !actual) return null;
  const point = preferred ?? { ...actual!, segmentId: 'rendered' };
  const actualClipId = sample?.sourceAnchor?.sourceClipId;
  const actualOwner = project.clips.find((clip) => clip.id === actualClipId);
  const sourceOwner =
    region.sourceBinding?.coordinateSpace === 'source-window' && actualOwner?.type === 'VIDEO'
      ? (actualOwner.sourceInstanceId ?? actualClipId)
      : actualClipId;
  const sourceSegment = `${sourceOwner ?? 'canvas'}:${sample?.captureSegment ?? ''}`;
  const observation = actual ? 'observed' : 'unobserved';
  const segmentId = `${point.segmentId}:${sourceSegment}:${observation}`;
  const binding: ProjectCameraSourceBinding = {
    ...('sourceClipId' in point && point.sourceClipId ? { focusClipId: point.sourceClipId } : {}),
    ...((!rendered || nativeCursor) && actualClipId ? { actualClipId } : {}),
    ...(rendered && !nativeCursor ? { renderedCursor: true } : {}),
    ...(rendered && nativeCursor ? { sourceCursor: true } : {}),
  };
  const authoredSegment = focus && path.segments.find((segment) => segment.id === focus.id);
  const frame: FollowCursorFrame = {
    x: point.x,
    y: point.y,
    time,
    segmentId,
    ...(authoredSegment && focus
      ? { preferenceWeight: cursorFocusPreferenceWeight(authoredSegment, focus.sourceTime) }
      : {}),
    ...(actual ? { actual } : {}),
  };
  return { frame, binding, preferred };
}

function retainClosingProjectFrames(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  frames: readonly FollowCursorFrame[],
  bindings: Map<string, ProjectCameraSourceBinding>
) {
  const closingFrames: FollowCursorFrame[] = [];
  {
    for (const clip of project.clips) {
      const time = clip.startTime + clip.duration;
      if (time <= region.startTime || time > region.startTime + region.duration) continue;
      const previous = frames.findLast(
        (frame) => frame.time < time && bindings.get(frame.segmentId)?.actualClipId === clip.id
      );
      if (!previous) continue;
      const separate = project.cursorTrack?.captureMode === VideoCursorCaptureMode.SEPARATE;
      const sample = separate
        ? resolveCursorSample(project, time, clip.id, { includeSourceEnd: true })
        : resolveObservedCursorPosition(project, time, clip.id, { includeSourceEnd: true });
      if (
        !sample?.visible ||
        (sample.observation && sample.observation !== 'observed') ||
        !sample.recordingPoint
      )
        continue;
      const precedingSample = separate
        ? resolveCursorSample(project, previous.time, clip.id)
        : resolveObservedCursorPosition(project, previous.time, clip.id);
      const segmentId =
        precedingSample?.captureSegment === sample.captureSegment
          ? previous.segmentId
          : `${previous.segmentId}:closing:${clip.id}:${sample.captureSegment ?? ''}`;
      bindings.set(segmentId, bindings.get(previous.segmentId)!);
      closingFrames.push({
        ...previous,
        time,
        segmentId,
        actual: sample.recordingPoint ?? {
          x: sample.x / project.width,
          y: sample.y / project.height,
        },
      });
    }
  }
  // Preserve both one-sided observations at a cut. A missing right observation cannot replace the closing fact.
  const retained = frames.filter(
    (frame) => frame.actual || !closingFrames.some((closing) => closing.time === frame.time)
  );
  return [...closingFrames, ...retained].sort((a, b) => a.time - b.time);
}

function collectProjectCameraFrames(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  connection?: { source: VideoProjectMotionRegion; destination: VideoProjectMotionRegion }
) {
  const path = resolveProjectCursorFocusPath(project);
  const end = region.startTime + region.duration;
  const times = new Set([region.startTime, end]);
  const step = Math.max(1 / 30, region.duration / 18000);
  for (let time = region.startTime + step; time < end; time += step) times.add(time);
  for (const time of [
    ...(project.cursorTrack?.samples ?? []).map((sample) => sample.time),
    ...resolveProjectCursorFocusSamples(project, true).map((sample) => sample.time),
    ...project.clips.flatMap((clip) => [
      clip.startTime,
      clip.startTime + clip.duration,
      ...(clip.type === 'VIDEO' &&
      project.tracks.some((track) => track.id === clip.trackId && track.role === 'CAMERA')
        ? cameraSourceGeometryBreaks(clip, project)
        : []),
    ]),
  ])
    if (time >= region.startTime && time <= end) times.add(time);
  const frames: FollowCursorFrame[] = [];
  const bindings = new Map<string, ProjectCameraSourceBinding>();
  const parts = resolveMotionWindowCameraParts(project, region);
  let continuity = 0;
  let previousClipId: string | undefined;
  let previousFocus: { x: number; y: number; segmentId: string; sourceClipId?: string } | undefined;
  for (const time of [...times].sort((a, b) => a - b)) {
    const part = parts.find(
      (item) => time >= item.startTime && time < item.startTime + item.duration
    );
    const clipId = connection
      ? resolveMotionConnectionVideo(project, connection.source, connection.destination, time)?.id
      : (part?.sourceBinding?.clipId ?? region.sourceBinding?.clipId);
    if (clipId && previousClipId && clipId !== previousClipId) {
      const left = project.clips.find((clip) => clip.id === previousClipId);
      const right = project.clips.find((clip) => clip.id === clipId);
      if (
        left?.type !== 'VIDEO' ||
        right?.type !== 'VIDEO' ||
        Math.abs(left.sourceStart + left.sourceDuration - right.sourceStart) > 1e-9
      )
        continuity++;
    }
    if (clipId) previousClipId = clipId;
    const result = projectCameraFrameAtTime(project, region, path, time, previousFocus, clipId);
    if (!result) continue;
    if (region.sourceBinding?.coordinateSpace === 'source-window')
      result.frame.segmentId += `:run:${continuity}`;
    if (result.preferred) previousFocus = result.preferred;
    frames.push(result.frame);
    bindings.set(result.frame.segmentId, result.binding);
  }
  const retained = retainClosingProjectFrames(project, region, frames, bindings);
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  const crop =
    region.sourceBinding?.coordinateSpace === 'source-window' && clip?.type === 'VIDEO'
      ? clip.sourceCrop
      : undefined;
  const visibleFrames = crop ? cropWindowCameraObservations(retained, crop) : retained;
  const preferred = smoothCursorCameraPreferences(visibleFrames, region.cursorComposition);
  return { frames: preferred, bindings, path };
}

function resolveProvisionalPlanEntry(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
) {
  region = resolveMotionWindowCameraRegion(project, region);
  const viewport = output ?? { width: project.width, height: project.height };
  const key = `${region.id}:${viewport.width}:${viewport.height}:${output?.resolution ?? 'SOURCE'}`;
  const signature = JSON.stringify({
    region,
    defaults: project.cameraFollowDefaults,
    path: project.cursorFocusPath,
    captureMode: project.cursorTrack?.captureMode,
  });
  let cached = plans.get(project);
  if (!cached) {
    cached = new Map();
    plans.set(project, cached);
  }
  const previous = cached.get(key);
  if (previous?.signature === signature) return previous;
  const { frames, bindings, path } = collectProjectCameraFrames(project, region);
  const policy = resolveCameraFollowPolicy({
    legacySensitivity: path.sensitivity,
    ...(project.cameraFollowDefaults ? { defaults: project.cameraFollowDefaults } : {}),
    ...(region.cameraFollow ? { override: region.cameraFollow } : {}),
  });
  const geometry = createProjectWorkingZoneCameraGeometry({
    project,
    region,
    bindings,
    policy,
    ...resolveProjectCameraEdges(project, region),
    ...(output ? { output } : {}),
  });
  const center = region.focusPoint ?? { x: project.width / 2, y: project.height / 2 };
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  const sampleTime = Math.max(region.startTime, clip?.startTime ?? region.startTime);
  const window = resolveMotionSourceWindow(project, region, sampleTime);
  const point = window && motionWindowFocusToWindow(project, region, center, sampleTime);
  const normalized =
    window && point
      ? {
          x: (point.x - window.window.x) / window.window.width,
          y: (point.y - window.window.y) / window.window.height,
        }
      : { x: center.x / project.width, y: center.y / project.height };
  const input = {
    frames,
    geometry,
    policy,
    ...(region.cursorComposition ? { tracking: 'continuous' as const } : {}),
    start: region.startTime,
    end: region.startTime + region.duration,
    targetScale: region.scale,
    fallback: {
      x: (normalized.x * region.scale - 0.5) * geometry.window.width,
      y: (normalized.y * region.scale - 0.5) * geometry.window.height,
    },
  };
  const plan = planWorkingZoneCamera(input);
  const entry = { signature, plan, geometry, input };
  cached.set(key, entry);
  return entry;
}

function projectCameraTargetScale(project: VideoProject, item: VideoProjectMotionRegion) {
  return resolveMotionTargetScale(project, item);
}

function compatibleProjectCameraPhases(
  project: VideoProject,
  left: VideoProjectMotionRegion,
  right: VideoProjectMotionRegion,
  targetScale: number
) {
  if (left.incomingConnection || right.incomingConnection) return false;
  if (
    projectCameraTargetScale(project, left) !== projectCameraTargetScale(project, right) ||
    projectCameraTargetScale(project, left) !== targetScale
  )
    return false;
  if (left.animation && right.animation) {
    return (
      left.animation.duration === right.animation.duration &&
      Math.abs(left.animation.end - right.animation.start) <= 1e-9 &&
      Math.abs(
        (left.animation.end - left.animation.start) / left.duration -
          (right.animation.end - right.animation.start) / right.duration
      ) <= 1e-9 &&
      left.easing === right.easing &&
      left.phaseTransitions?.enter === right.phaseTransitions?.enter &&
      left.phaseTransitions?.exit === right.phaseTransitions?.exit &&
      left.zoomInDuration === right.zoomInDuration &&
      left.zoomOutDuration === right.zoomOutDuration
    );
  }
  return (
    !left.animation && !right.animation && left.zoomOutDuration === 0 && right.zoomInDuration === 0
  );
}

function continuousProjectCameraSource(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number
) {
  const binding = region.sourceBinding?.clipId;
  if (
    !project.clips.some(
      (clip) =>
        (!binding || clip.id === binding) &&
        clip.startTime < time &&
        clip.startTime + clip.duration > time
    )
  )
    return false;
  const coverage = collectProjectCameraFrames(project, {
    ...region,
    startTime: time - 1e-5,
    duration: 2e-5,
  }).frames;
  if (
    coverage.length &&
    (coverage[0]!.time >= time ||
      coverage.at(-1)!.time <= time ||
      coverage[0]!.segmentId !== coverage.at(-1)!.segmentId)
  )
    return false;
  return true;
}

function sharedProjectCameraBoundary(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  left: VideoProjectMotionRegion,
  right: VideoProjectMotionRegion,
  geometry: WorkingZoneCameraGeometry,
  output?: CameraOutputViewport
): CameraBoundaryState | Extract<WorkingZoneCameraPlan, { status: 'conflict' }> | undefined {
  if (!compatibleProjectCameraPhases(project, left, right, region.scale)) return undefined;
  const time = right.startTime;
  if (!continuousProjectCameraSource(project, region, time)) return undefined;
  const owner =
    left.focusMode !== VideoMotionFocusMode.CURSOR
      ? left
      : right.focusMode !== VideoMotionFocusMode.CURSOR
        ? right
        : left;
  if (owner.focusMode === VideoMotionFocusMode.CURSOR) {
    const plan = resolveProvisionalPlanEntry(project, owner, output).plan;
    if (plan.status === 'conflict')
      return {
        ...plan,
        interval: { start: region.startTime, end: region.startTime + region.duration },
        time,
      };
    return plan.targetScale === region.scale
      ? evaluateWorkingZoneCameraBoundary(plan, time)
      : undefined;
  }
  if (
    owner.focusMode !== VideoMotionFocusMode.MANUAL &&
    owner.focusMode !== VideoMotionFocusMode.MANUAL_AREA
  )
    return undefined;
  const point =
    owner.focusMode === VideoMotionFocusMode.MANUAL_AREA && owner.focusArea
      ? motionFocusAreaPoint(owner.focusArea, 0.5, 0.5)
      : (owner.focusPoint ?? { x: project.width / 2, y: project.height / 2 });
  const viewport = resolveCameraViewportFrame(project, point, region.scale);
  return {
    pan: {
      x: (viewport.viewportX / project.width) * region.scale * geometry.window.width,
      y: (viewport.viewportY / project.height) * region.scale * geometry.window.height,
    },
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
  };
}

function resolvePlanEntry(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
): ProjectCameraPlanEntry {
  region = resolveMotionWindowCameraRegion(project, region);
  const provisional = resolveProvisionalPlanEntry(project, region, output);
  const boundaries: WorkingZoneCameraBoundaries = {};
  const neighbors = (project.motionRegions ?? [])
    .filter(isCameraMotionRegion)
    .filter((item) => item.duration > 0 && item.id !== region.id);
  const previous = neighbors.find((item) => item.startTime + item.duration === region.startTime);
  const next = neighbors.find((item) => item.startTime === region.startTime + region.duration);
  const key = [
    region.id,
    provisional.geometry.viewport.width,
    provisional.geometry.viewport.height,
    output?.resolution ?? 'SOURCE',
    'final',
  ].join(':');
  const signature = JSON.stringify([provisional.signature, previous, next]);
  const cache = plans.get(project)!;
  const previousPlan = cache.get(key);
  if (previousPlan?.signature === signature) return previousPlan;
  const incoming =
      previous &&
      sharedProjectCameraBoundary(project, region, previous, region, provisional.geometry, output),
    outgoing =
      next &&
      sharedProjectCameraBoundary(project, region, region, next, provisional.geometry, output);
  const inheritedConflict =
    incoming && 'status' in incoming
      ? incoming
      : outgoing && 'status' in outgoing
        ? outgoing
        : undefined;
  if (inheritedConflict) {
    const entry = { ...provisional, signature, plan: inheritedConflict };
    cache.set(key, entry);
    return entry;
  }
  if (incoming && !('status' in incoming)) boundaries.incoming = incoming;
  if (outgoing && !('status' in outgoing)) boundaries.outgoing = outgoing;
  const entry = {
    ...provisional,
    signature,
    plan:
      boundaries.incoming || boundaries.outgoing
        ? planWorkingZoneCamera({ ...provisional.input, ...boundaries })
        : provisional.plan,
  };
  cache.set(key, entry);
  return entry;
}

/** Preview, seek, and export share one disposable admission result for the same immutable project and geometry. */
export function resolveProjectCursorCameraPlan(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
) {
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  const playback = clip && resolveMotionSourcePlayback(project, clip.startTime, clip.id);
  if (playback) {
    const sourceRegion = playback.geometryProject.motionRegions?.find(
      (item) => item.id === (playback.regionIds.get(region.id) ?? region.id)
    );
    if (sourceRegion) {
      project = playback.geometryProject;
      region = sourceRegion;
    }
  }
  project = projectMotionSourcePhases(project);
  region = project.motionRegions?.find((item) => item.id === region.id) ?? region;
  const prepared = preparedProjectCamera(project);
  if (prepared) {
    const entry =
      prepared.output === projectCameraOutputKey(project, output)
        ? prepared.cameras.find((item) => item.key === projectCameraGeometryKey(project, region))
        : undefined;
    if (!entry) throw new Error('Prepared camera geometry is unavailable.');
    return entry.plan;
  }
  return resolvePlanEntry(project, region, output).plan;
}

/** Preserve admission diagnostics locally; runtime responses retain the stable message code. */
export class ProjectCameraConflictError extends Error {
  readonly conflicts: readonly ProjectCameraConflict[];

  constructor(conflicts: readonly ProjectCameraConflict[]) {
    super('PROJECT_EXPORT_CAMERA_CONFLICT');
    this.name = 'ProjectCameraConflictError';
    this.conflicts = structuredClone(conflicts);
  }
}

/** Resolve a frozen window target once for link rendering and fragment admission. */
export function resolveProjectWindowCameraEndpoint(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number,
  output?: CameraOutputViewport
) {
  if (region.focusMode === VideoMotionFocusMode.CURSOR) {
    const following = resolveProjectFollowingCamera(project, region, time, output);
    return {
      scale: following.targetScale,
      pan: {
        x: following.pan.x / following.geometry.window.width,
        y: following.pan.y / following.geometry.window.height,
      },
      conflict: following.plan.status === 'conflict' ? following.plan : null,
    };
  }
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  if (!clip) return null;
  const sampleTime = Math.max(
    clip.startTime,
    Math.min(time, clip.startTime + clip.duration - 1e-9)
  );
  const window = resolveMotionSourceWindow(project, region, sampleTime);
  if (!window) return null;
  const point = motionWindowFocusToWindow(
    project,
    region,
    resolveManualMotionFocusPoint(project, region, sampleTime),
    sampleTime
  );
  const scale = resolveMotionTargetScale(project, region);
  const offset = (value: number) => Math.max(0, Math.min(scale - 1, scale * value - 0.5));
  return {
    scale,
    pan: {
      x: offset((point.x - window.window.x) / window.window.width),
      y: offset((point.y - window.window.y) / window.window.height),
    },
    conflict: null,
  };
}

/** The same disposable link result owns validation and the rendered temporary fit. */
export function resolveProjectWindowCameraLink(
  project: VideoProject,
  source: VideoProjectMotionRegion,
  destination: VideoProjectMotionRegion,
  output?: CameraOutputViewport
): { conflict: ProjectCameraConflict | null; fit?: WindowCameraLinkFit } {
  const start = source.startTime + source.duration,
    end = destination.startTime;
  const interval = { start, end };
  const failure = (reason: ProjectCameraConflict['reason'], time = start) => ({
    conflict: { regionId: source.id, interval, reason, time },
  });
  const from = resolveProjectWindowCameraEndpoint(project, source, start, output);
  const to = resolveProjectWindowCameraEndpoint(project, destination, end, output);
  if (!from || !to) return failure('unproven');
  if (from.conflict || to.conflict) {
    const conflict = from.conflict ?? to.conflict!;
    return failure(conflict.reason, conflict.time);
  }
  const clip = resolveMotionConnectionVideo(project, source, destination, start);
  if (!clip || !source.sourceBinding) return failure('unproven');
  const target = { ...source, sourceBinding: { ...source.sourceBinding, clipId: clip.id } };
  const layout = resolveMotionSourceWindow(project, target, start);
  if (!layout) return failure('unproven');
  const size = output ?? { width: project.width, height: project.height };
  const transform = resolveProjectOutputTransform(project, size);
  const mapRect = (rect: typeof layout.window) => ({
    x: rect.x * transform.scale + transform.offsetX,
    y: rect.y * transform.scale + transform.offsetY,
    width: rect.width * transform.scale,
    height: rect.height * transform.scale,
  });
  const window = mapRect(layout.window);
  const context = source.focusMode === VideoMotionFocusMode.CURSOR ? source : destination;
  const path = resolveProjectCursorFocusPath(project);
  const policy = resolveCameraFollowPolicy({
    legacySensitivity: path.sensitivity,
    ...(project.cameraFollowDefaults ? { defaults: project.cameraFollowDefaults } : {}),
    ...(context.cameraFollow ? { override: context.cameraFollow } : {}),
  });
  const spatial = projectCursorLinkSettings(project, source, destination, start, end);
  const entry = resolvePlanEntry(project, context, output);
  const key = JSON.stringify([
    entry.signature,
    source,
    destination,
    from,
    to,
    size,
    layout,
    spatial,
  ]);
  const cached = (entry.links ??= new Map());
  const previous = cached.get(key);
  if (previous) return previous;
  const adapter = createWindowCameraLinkGeometry({
    output: size,
    window,
    ...createProjectWindowPlaneProjection(project, target, size),
    video: mapRect(layout.video),
    cornerRadius: (clip.windowCornerRadius ?? 0) * transform.scale,
    windowWeight: spatial.windowWeight,
    type: motionTransitionTypeForEasing(destination.incomingConnection?.easing ?? 'EASE_IN_OUT'),
    from: {
      end: start,
      scale: from.scale,
      pan: { x: from.pan.x * window.width, y: from.pan.y * window.height },
      ...spatial.from,
    },
    to: {
      start: end,
      scale: to.scale,
      pan: { x: to.pan.x * window.width, y: to.pan.y * window.height },
      ...spatial.to,
    },
    policy,
  });
  const gap = { ...context, startTime: start, duration: end - start };
  const observations = collectProjectCameraFrames(project, gap, { source, destination }).frames;
  const proof = planWindowCameraGap({
    adapter,
    start,
    end,
    targetScale: to.scale,
    toPan: { x: to.pan.x * window.width, y: to.pan.y * window.height },
    policy,
    observations,
  });
  const result =
    proof.status === 'conflict'
      ? failure(proof.reason, proof.time)
      : { conflict: null, ...(proof.fit ? { fit: proof.fit } : {}) };
  cached.set(key, result);
  if (cached.size > 4) cached.delete(cached.keys().next().value ?? '');
  return result;
}

/** Refuse only exports that use an unresolved active follow camera. This check acquires no resources. */
export function resolveProjectCameraConflicts(
  project: VideoProjectRenderScope,
  output?: CameraOutputViewport,
  interval = { start: 0, end: project.duration }
): ProjectCameraConflict[] {
  const prepared = preparedProjectCamera(project);
  if (prepared?.output === projectCameraOutputKey(project, output))
    return prepared.conflicts.filter(
      (item) => item.interval.start < interval.end && item.interval.end > interval.start
    );
  project = projectMotionSourcePhases(project[VIDEO_PROJECT_ATTACHMENT_GEOMETRY] ?? project);
  if (!isVideoProjectUtilityLaneVisible(project, 'camera')) return [];
  const conflicts = (project.motionRegions ?? []).filter(isCameraMotionRegion).flatMap((region) => {
    if (
      region.focusMode !== VideoMotionFocusMode.CURSOR ||
      region.duration <= 0 ||
      region.startTime >= interval.end ||
      region.startTime + region.duration <= interval.start
    )
      return [];
    const plan = resolveProjectCursorCameraPlan(project, region, output);
    return plan.status === 'conflict'
      ? [{ regionId: region.id, time: plan.time, interval: plan.interval, reason: plan.reason }]
      : [];
  });
  for (const destination of (project.motionRegions ?? []).filter(isCameraMotionRegion)) {
    if (destination.sourceBinding?.coordinateSpace !== 'source-window') continue;
    const source = resolveMotionConnectionSource(project, destination);
    if (
      !source ||
      (source.focusMode !== VideoMotionFocusMode.CURSOR &&
        destination.focusMode !== VideoMotionFocusMode.CURSOR)
    )
      continue;
    const start = source.startTime + source.duration;
    if (
      start >= destination.startTime ||
      start >= interval.end ||
      destination.startTime <= interval.start
    )
      continue;
    const { conflict } = resolveProjectWindowCameraLink(project, source, destination, output);
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

/** Convert admitted output-pixel pan to the existing project-space camera contract without late clamps. */
export function resolveProjectFollowingCamera(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  time: number,
  output?: CameraOutputViewport
) {
  const playback =
    region.sourceBinding && resolveMotionSourcePlayback(project, time, region.sourceBinding.clipId);
  if (playback) {
    const sourceRegion = playback.geometryProject.motionRegions?.find(
      (item) => item.id === (playback.regionIds.get(region.id) ?? region.id)
    );
    if (sourceRegion) {
      project = playback.geometryProject;
      region = sourceRegion;
      time = playback.time;
    }
  }
  project = projectMotionSourcePhases(project);
  region = project.motionRegions?.find((item) => item.id === region.id) ?? region;
  const prepared = preparedProjectCamera(project);
  const ready =
    prepared?.output === projectCameraOutputKey(project, output)
      ? prepared.cameras.find((item) => item.key === projectCameraGeometryKey(project, region))
      : undefined;
  if (prepared && !ready) throw new Error('Prepared camera geometry is unavailable.');
  const { plan, geometry } = ready ?? resolvePlanEntry(project, region, output);
  const pan = evaluateWorkingZoneCamera(plan, time);
  const targetScale = plan.status === 'ready' ? plan.targetScale : region.scale;
  return {
    plan,
    pan,
    targetScale,
    geometry,
    focusPoint: {
      x: ((pan.x / geometry.window.width + 0.5) / targetScale) * project.width,
      y: ((pan.y / geometry.window.height + 0.5) / targetScale) * project.height,
    },
  };
}

/** Copies an admitted camera into plain values without retaining its proof geometry or inputs. */
export function snapshotProjectCameraPlan(
  project: VideoProject,
  region: VideoProjectMotionRegion,
  output?: CameraOutputViewport
): PreparedProjectCamera['cameras'][number] {
  const entry = resolvePlanEntry(project, region, output);
  return {
    key: projectCameraGeometryKey(project, region),
    plan: entry.plan,
    geometry: {
      window: { ...entry.geometry.window },
      viewport: { ...entry.geometry.viewport },
    },
  };
}
