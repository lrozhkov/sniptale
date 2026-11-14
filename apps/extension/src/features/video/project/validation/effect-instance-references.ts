import { isEffectHostTimingValid } from '../effect-instance/timing';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
} from '../effect-instance/types';
import type { VideoProjectClip, VideoProjectEffectClip, VideoProjectTransition } from '../types';
import { VideoProjectClipType } from '../types';

export interface VideoProjectEffectReferenceModel {
  clips: VideoProjectClip[];
  assets?: import('../types').VideoProjectAsset[];
  tracks?: import('../types').VideoProjectTrack[];
  effectInstances?: VideoProjectEffectInstance[];
  effectSnapshots?: Array<Pick<VideoProjectEffectSnapshot, 'id' | 'kind'>>;
  transitions?: VideoProjectTransition[];
}

interface EffectReferenceContext {
  hostByInstanceId: Map<string, VideoProjectEffectClip>;
  instanceIds: Set<string>;
  project: VideoProjectEffectReferenceModel;
  snapshots: Map<string, Pick<VideoProjectEffectSnapshot, 'id' | 'kind'>>;
}

export function hasValidEffectProjectReferences(
  project: VideoProjectEffectReferenceModel
): boolean {
  const effectHosts = project.clips.filter(
    (clip): clip is VideoProjectEffectClip => clip.type === VideoProjectClipType.EFFECT
  );
  const hostByInstanceId = collectEffectHosts(effectHosts);
  if (!hostByInstanceId || !effectHosts.every((host) => hasValidAttachment(host, project)))
    return false;
  const context: EffectReferenceContext = {
    hostByInstanceId,
    instanceIds: new Set(),
    project,
    snapshots: new Map((project.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])),
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
  return (
    instance.kind === 'standalone' &&
    instance.target.kind === 'scene' &&
    isValidStandaloneInstance(instance, context)
  );
}

function isValidStandaloneInstance(
  instance: VideoProjectEffectInstance,
  context: EffectReferenceContext
): boolean {
  const host = context.hostByInstanceId.get(instance.id);
  return (
    instance.kind === 'standalone' && host !== undefined && isEffectHostTimingValid(host, instance)
  );
}

/** Removed source placements are dormant; an attachment cannot select another material. */
function hasValidAttachment(
  host: VideoProjectEffectClip,
  project: VideoProjectEffectReferenceModel
): boolean {
  const bindings = [
    host.attachment?.kind === 'source' ? host.attachment : undefined,
    host.sourceRange,
  ].filter((binding) => binding !== undefined);
  return bindings.every((binding) => {
    const asset = project.assets?.find((entry) => entry.id === binding.assetId);
    if (!asset || (asset.type !== 'VIDEO' && asset.type !== 'RECORDING')) return false;
    return project.clips.every(
      (clip) =>
        !('sourceInstanceId' in clip) ||
        clip.sourceInstanceId !== binding.sourceInstanceId ||
        clip.assetId === binding.assetId
    );
  });
}
