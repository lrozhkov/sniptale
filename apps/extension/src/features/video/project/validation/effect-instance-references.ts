import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import type { VideoProjectClip, VideoProjectEffectClip, VideoProjectTransition } from '../types';
import { VideoProjectClipType } from '../types';

export interface VideoProjectEffectReferenceModel {
  clips: VideoProjectClip[];
  effectInstances?: VideoProjectEffectInstance[];
  effectSnapshots?: Array<Pick<VideoProjectEffectSnapshot, 'id' | 'kind'>>;
  transitions?: VideoProjectTransition[];
}

interface EffectReferenceContext {
  hostByInstanceId: Map<string, VideoProjectEffectClip>;
  instanceIds: Set<string>;
  project: VideoProjectEffectReferenceModel;
  snapshots: Map<string, Pick<VideoProjectEffectSnapshot, 'id' | 'kind'>>;
  transitionTargets: Set<string>;
}

export function hasValidEffectProjectReferences(
  project: VideoProjectEffectReferenceModel
): boolean {
  const effectHosts = project.clips.filter(
    (clip): clip is VideoProjectEffectClip => clip.type === VideoProjectClipType.EFFECT
  );
  const hostByInstanceId = collectEffectHosts(effectHosts);
  if (!hostByInstanceId) return false;
  const context: EffectReferenceContext = {
    hostByInstanceId,
    instanceIds: new Set(),
    project,
    snapshots: new Map((project.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])),
    transitionTargets: new Set(),
  };
  if (!(project.effectInstances ?? []).every((instance) => isValidInstance(instance, context))) {
    return false;
  }
  const standaloneInstanceIds = new Set(
    (project.effectInstances ?? [])
      .filter(({ kind, target }) => kind === 'standalone' && target.kind === 'scene')
      .map(({ id }) => id)
  );
  return effectHosts.every(({ effectInstanceId }) => standaloneInstanceIds.has(effectInstanceId));
}

function collectEffectHosts(
  effectHosts: VideoProjectEffectClip[]
): Map<string, VideoProjectEffectClip> | null {
  const hostByInstanceId = new Map<string, VideoProjectEffectClip>();
  for (const host of effectHosts) {
    if (hostByInstanceId.has(host.effectInstanceId)) return null;
    hostByInstanceId.set(host.effectInstanceId, host);
  }
  return hostByInstanceId;
}

function isValidInstance(
  instance: VideoProjectEffectInstance,
  context: EffectReferenceContext
): boolean {
  if (context.instanceIds.has(instance.id)) return false;
  context.instanceIds.add(instance.id);
  const snapshot = context.snapshots.get(instance.snapshotId);
  if (!snapshot || snapshot.kind !== instance.kind) return false;
  if (instance.target.kind === 'scene') return isValidStandaloneInstance(instance, context);
  if (instance.target.kind === 'clip')
    return isValidTargetEffectInstance(instance, context.project);
  return isValidTransitionInstance(instance, context);
}

function isValidStandaloneInstance(
  instance: VideoProjectEffectInstance,
  context: EffectReferenceContext
): boolean {
  const host = context.hostByInstanceId.get(instance.id);
  return (
    instance.kind === 'standalone' &&
    host !== undefined &&
    nearlyEqual(host.startTime, instance.startTime) &&
    nearlyEqual(host.duration, instance.duration)
  );
}

function isValidTargetEffectInstance(
  instance: VideoProjectEffectInstance,
  project: VideoProjectEffectReferenceModel
): boolean {
  if (instance.kind !== 'targetEffect' || instance.target.kind !== 'clip') return false;
  const { clipId } = instance.target;
  return project.clips.some(
    ({ id, type }) =>
      id === clipId && type !== VideoProjectClipType.AUDIO && type !== VideoProjectClipType.EFFECT
  );
}

function isValidTransitionInstance(
  instance: VideoProjectEffectInstance,
  context: EffectReferenceContext
): boolean {
  const target = instance.target;
  if (
    instance.kind !== 'transition' ||
    target.kind !== 'transition' ||
    context.project.transitions?.some(({ id }) => id === target.transitionId) !== true ||
    context.transitionTargets.has(target.transitionId)
  ) {
    return false;
  }
  context.transitionTargets.add(target.transitionId);
  return true;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-7;
}
