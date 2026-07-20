import { buildProjectTransitionSegments } from '../../../project/transition/project';
import {
  isEffectInstanceTimingEqual,
  resolveEffectInstanceTime,
} from '../../../project/effect-instance/timing';
import type { VideoProject } from '../../../project/types/index';
import { assertEffectRasterDimensions } from '../runtime/resource-limits';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';
import type { EffectRuntimeFrameDimensions, EffectRuntimeFramePlan } from '../runtime/types';
import { resolveEffectRuntimeFrameTarget, type UnindexedEffectRuntimeFrameTarget } from './target';

type EffectRuntimePlanErrorCode =
  | 'effectPlanIntegrityFailure'
  | 'effectPlanTargetFailure'
  | 'effectTransitionTimingMismatch';

class EffectRuntimePlanError extends Error {
  readonly code: EffectRuntimePlanErrorCode;

  constructor(code: EffectRuntimePlanErrorCode) {
    super(`Effect runtime plan failed: ${code}`);
    this.name = 'EffectRuntimePlanError';
    this.code = code;
  }
}

export function resolveEffectRuntimeFramePlans(
  project: VideoProject,
  projectTime: number
): EffectRuntimeFramePlan[] {
  const snapshots = new Map(
    (project.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])
  );
  const transitionSegments = buildProjectTransitionSegments(project);
  const chainIndexes = new Map<string, number>();
  const plans: EffectRuntimeFramePlan[] = [];
  for (const instance of project.effectInstances ?? []) {
    const plan = resolveInstanceFramePlan({
      chainIndexes,
      instance,
      project,
      projectTime,
      snapshots,
      transitionSegments,
    });
    if (plan) plans.push(plan);
  }
  return plans;
}

function resolveInstanceFramePlan(args: {
  chainIndexes: Map<string, number>;
  instance: NonNullable<VideoProject['effectInstances']>[number];
  project: VideoProject;
  projectTime: number;
  snapshots: Map<string, NonNullable<VideoProject['effectSnapshots']>[number]>;
  transitionSegments: ReturnType<typeof buildProjectTransitionSegments>;
}): EffectRuntimeFramePlan | null {
  const { instance } = args;
  if (!instance.enabled) return null;
  const snapshot = args.snapshots.get(instance.snapshotId);
  if (!snapshot || snapshot.kind !== instance.kind) fail('effectPlanIntegrityFailure');
  const document = parseSnapshotDocument(snapshot.source);
  assertSnapshotDocument(instance, snapshot, document);
  const timing = resolveEffectInstanceTime(instance, document.duration, args.projectTime);
  if (!timing) return null;
  const target = resolveEffectRuntimeFrameTarget(
    args.project,
    instance,
    args.transitionSegments,
    args.projectTime
  );
  if (target === undefined) fail('effectPlanTargetFailure');
  if (target === null) return null;
  assertTransitionTiming(instance, target, args.transitionSegments);
  const resolvedTarget =
    target.kind === 'clip'
      ? { ...target, chainIndex: takeChainIndex(args.chainIndexes, target.clipId) }
      : target;
  const dimensions = resolveDimensions(args.project, target);
  return {
    assets: snapshot.assets,
    controls: instance.controls,
    dimensions,
    documentSha256: snapshot.sha256,
    documentSource: snapshot.source,
    duration: document.duration,
    effectInstanceId: instance.id,
    fps: args.project.fps,
    frameIndex: Math.max(0, Math.round(timing.effectTime * args.project.fps)),
    kind: instance.kind,
    progress: timing.progress,
    renderDimensions: dimensions,
    snapshotId: snapshot.id,
    target: resolvedTarget,
    time: timing.effectTime,
  };
}

function assertSnapshotDocument(
  instance: NonNullable<VideoProject['effectInstances']>[number],
  snapshot: NonNullable<VideoProject['effectSnapshots']>[number],
  document: ReturnType<typeof parseSnapshotDocument>
): void {
  if (
    document.id !== snapshot.documentId ||
    document.kind !== snapshot.kind ||
    !isEffectInstanceTimingEqual(document.duration, instance.duration * instance.playbackRate)
  ) {
    fail('effectPlanIntegrityFailure');
  }
}

function assertTransitionTiming(
  instance: NonNullable<VideoProject['effectInstances']>[number],
  target: UnindexedEffectRuntimeFrameTarget,
  segments: ReturnType<typeof buildProjectTransitionSegments>
): void {
  if (target.kind !== 'transition') return;
  const segment = segments.find(({ id }) => id === target.transitionId)!;
  if (
    !isEffectInstanceTimingEqual(instance.startTime, segment.start) ||
    !isEffectInstanceTimingEqual(instance.duration, segment.end - segment.start)
  ) {
    fail('effectTransitionTimingMismatch');
  }
}

function parseSnapshotDocument(source: string) {
  try {
    return parseEffectRuntimeSnapshotDocument(source);
  } catch {
    fail('effectPlanIntegrityFailure');
  }
}

function resolveDimensions(
  project: VideoProject,
  target: UnindexedEffectRuntimeFrameTarget
): EffectRuntimeFrameDimensions {
  const dimensions =
    target.kind === 'clip' || target.kind === 'scene'
      ? { height: target.placement.height, width: target.placement.width }
      : { height: project.height, width: project.width };
  const width = Math.max(1, Math.round(dimensions.width));
  const height = Math.max(1, Math.round(dimensions.height));
  try {
    assertEffectRasterDimensions(width, height);
  } catch {
    fail('effectPlanTargetFailure');
  }
  return { height, width };
}

function takeChainIndex(indexes: Map<string, number>, clipId: string): number {
  const index = indexes.get(clipId) ?? 0;
  indexes.set(clipId, index + 1);
  return index;
}

function fail(code: EffectRuntimePlanErrorCode): never {
  throw new EffectRuntimePlanError(code);
}
