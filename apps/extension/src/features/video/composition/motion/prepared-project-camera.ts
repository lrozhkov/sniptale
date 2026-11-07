import { isCameraMotionRegion } from '../../project/motion/normalization';
import { projectMotionSourcePhases } from '../../project/motion/source-binding';
import { isVideoProjectUtilityLaneVisible } from '../../project/utility-lanes';
import type { VideoProject, VideoProjectMotionRegion } from '../../project/types';
import type { CameraOutputViewport } from '../../project/export/output-dimensions';
import type { WorkingZoneCameraPlan } from './follow-cursor';
import type { CameraTrajectory } from './camera-trajectory';

/** Disposable output-clock Euler offsets; every span has continuous position and two derivatives. */
export interface CursorOrientationPlan {
  spans: readonly CameraTrajectory[];
  breaks: readonly number[];
}
export interface ProjectCameraConflict {
  regionId: string;
  time: number;
  interval: { start: number; end: number };
  reason: Extract<WorkingZoneCameraPlan, { status: 'conflict' }>['reason'];
}

export interface PreparedProjectCamera {
  readonly signature: string;
  readonly output: string;
  readonly cameras: readonly {
    readonly key: string;
    readonly plan: WorkingZoneCameraPlan;
    readonly geometry: {
      readonly window: { width: number; height: number };
      readonly viewport: { width: number; height: number };
    };
  }[];
  readonly orientations: readonly {
    readonly key: string;
    readonly plan: CursorOrientationPlan | undefined;
  }[];
  readonly conflicts: readonly ProjectCameraConflict[];
}

const preparedKey = Symbol('prepared-project-camera');
interface PreparedCameraProject extends VideoProject {
  readonly [preparedKey]?: PreparedProjectCamera;
}

const inputIds = new WeakMap<object, number>();
let nextInputId = 0;
function inputId(value: object | undefined | null): number {
  if (!value) return 0;
  let id = inputIds.get(value);
  if (id === undefined) {
    id = ++nextInputId;
    inputIds.set(value, id);
  }
  return id;
}

/** Exact immutable camera authorities, excluding loaded event windows and presentation-only fields. */
export function projectCameraInputSignature(project: VideoProject): string {
  return JSON.stringify([
    project.id,
    project.baseRecordingId,
    project.width,
    project.height,
    project.duration,
    inputId(project.clips),
    inputId(project.assets),
    inputId(project.tracks),
    inputId(project.transitions),
    inputId(project.motionRegions),
    inputId(project.sceneBackground),
    inputId(project.cameraFollowDefaults),
    inputId(project.cursorFocusPath),
    project.utilityLanes?.camera.visible,
    inputId(project.actionEvents),
    project.cursorTrack?.captureMode,
    inputId(project.cursorTrack?.skin),
    inputId(project.cursorTrack?.samples),
    project.cursorTrack?.sourceObservations?.map((group) => [
      group.recordingId,
      group.sourceInstanceId,
      inputId(group.trajectory),
      inputId(group.samples),
    ]),
    project.actionFeedback?.map((group) => [
      group.recordingId,
      group.sourceInstanceId,
      group.events ? inputId(group.events) : inputId(group.signals),
    ]),
  ]);
}

const geometryKeys = new WeakMap<VideoProject, WeakMap<VideoProjectMotionRegion, string>>();
/** Numeric clock and selected-source variant identity inside one prepared authored revision. */
export function projectCameraGeometryKey(
  project: VideoProject,
  region: VideoProjectMotionRegion
): string {
  let keys = geometryKeys.get(project);
  if (!keys) {
    keys = new WeakMap();
    geometryKeys.set(project, keys);
  }
  const cached = keys.get(region);
  if (cached) return cached;
  const clip = project.clips.find((item) => item.id === region.sourceBinding?.clipId);
  const key = JSON.stringify([
    region.id,
    region.startTime,
    region.duration,
    region.animation,
    region.sourceBinding,
    clip?.type === 'VIDEO'
      ? [
          clip.id,
          clip.startTime,
          clip.duration,
          clip.sourceStart,
          clip.sourceDuration,
          clip.playbackRate,
          clip.playbackWindow,
          clip.sourceCrop,
        ]
      : null,
  ]);
  keys.set(region, key);
  return key;
}

export function projectCameraOutputKey(
  project: VideoProject,
  output?: CameraOutputViewport
): string {
  return JSON.stringify([
    output?.width ?? project.width,
    output?.height ?? project.height,
    output?.resolution ?? 'SOURCE',
  ]);
}

function freezeNumericTree(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeNumericTree(child);
  Object.freeze(value);
}

/** Copies plain camera values so the published bundle cannot retain scratch facts or proof closures. */
export function freezePreparedProjectCamera(bundle: PreparedProjectCamera): PreparedProjectCamera {
  const copy = structuredClone(bundle);
  freezeNumericTree(copy);
  return copy;
}

/** A render-only attachment. The authored project remains the save authority. */
export function attachPreparedProjectCamera(
  project: VideoProject,
  bundle: PreparedProjectCamera
): VideoProject {
  if (projectCameraInputSignature(project) !== bundle.signature)
    throw new Error('Prepared camera inputs do not match the project.');
  const prepared: PreparedCameraProject = { ...project, [preparedKey]: bundle };
  return prepared;
}

/** Geometry variants inherit this attachment through existing disposable project projections. */
export function preparedProjectCamera(
  project: PreparedCameraProject
): PreparedProjectCamera | undefined {
  return project[preparedKey];
}

/** Only supported active native follow cameras need asynchronous archived camera preparation. */
export function projectRequiresPreparedCamera(project: VideoProject): boolean {
  if (
    !isVideoProjectUtilityLaneVisible(project, 'camera') ||
    !project.cursorTrack?.sourceObservations?.some(
      (group) => group.trajectory && group.trajectory.totalBlocks > 0
    )
  )
    return false;
  const dynamic =
    project.clips.some((clip) => clip.type === 'VIDEO' && clip.playbackWindow) &&
    (project.cursorFocusPath?.segments.some((segment) => segment.binding.kind === 'project') ||
      project.cursorTrack.samples.some((sample) => !sample.sourceAnchor) ||
      project.actionEvents.some((event) => event.anchor.kind === 'project'));
  return (
    !dynamic &&
    !!projectMotionSourcePhases(project).motionRegions?.some(
      (region) =>
        isCameraMotionRegion(region) &&
        !region.sourceBinding?.dormant &&
        region.focusMode === 'CURSOR' &&
        region.duration > 0
    )
  );
}

/** Compilation starts from authored inputs even when a caller passes a prior render-only view. */
export function withoutPreparedProjectCamera(project: PreparedCameraProject): VideoProject {
  const { [preparedKey]: _prepared, ...source } = project;
  return source;
}
