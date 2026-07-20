import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import { buildProjectTransitionSegments } from '../../../project/transition/project';
import { isEffectInstanceTimingEqual } from '../../../project/effect-instance/timing';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
  VideoProjectEffectSnapshotAsset,
} from '../../../project/effect-instance/types';
import type { VideoProject } from '../../../project/types/index';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';
import type { EffectRuntimeAudioPlan } from './types';
import { createEffectRuntimeAudioClipPlan } from './clip-plan';
import { resolveEffectTargetTrackAvailability } from '../frame/target-availability';

export type { EffectRuntimeAudioPlan } from './types';

type EffectClip = EffectV1Document['clips'][number];
type EffectRuntimeAudioPlanErrorCode = 'effectAudioIntegrityFailure' | 'effectAudioTargetFailure';
type EffectTargetAvailability =
  | { status: 'available'; timelineInterval?: { end: number; start: number } }
  | { status: 'hidden' | 'invalid' };

export class EffectRuntimeAudioPlanError extends Error {
  readonly code: EffectRuntimeAudioPlanErrorCode;

  constructor(code: EffectRuntimeAudioPlanErrorCode) {
    super(`Effect runtime audio plan failed: ${code}`);
    this.name = 'EffectRuntimeAudioPlanError';
    this.code = code;
  }
}

export function resolveEffectRuntimeAudioPlans(project: VideoProject): EffectRuntimeAudioPlan[] {
  const snapshots = new Map(
    (project.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])
  );
  const plans: EffectRuntimeAudioPlan[] = [];
  for (const instance of project.effectInstances ?? []) {
    plans.push(...resolveInstanceAudioPlans(project, instance, snapshots));
  }
  return plans.sort(
    (left, right) => left.startTime - right.startTime || left.id.localeCompare(right.id)
  );
}

function resolveInstanceAudioPlans(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  snapshots: Map<string, VideoProjectEffectSnapshot>
): EffectRuntimeAudioPlan[] {
  if (!instance.enabled) return [];
  const snapshot = snapshots.get(instance.snapshotId);
  if (!snapshot || snapshot.kind !== instance.kind) fail('effectAudioIntegrityFailure');
  const targetAvailability = resolveTargetAvailability(project, instance);
  if (targetAvailability.status === 'invalid') fail('effectAudioTargetFailure');
  if (targetAvailability.status === 'hidden') return [];
  if (targetAvailability.status !== 'available') return [];
  const document = parseSnapshot(snapshot);
  assertAudioSnapshotIntegrity(instance, snapshot, document);
  const declaredAssets = new Map(document.assets.map((asset) => [asset.id, asset]));
  return document.layers.flatMap((layer) => {
    if (layer.type !== 'audio' || layer.visible === false) return [];
    const assetId = typeof layer['assetId'] === 'string' ? layer['assetId'] : null;
    const descriptor = assetId ? declaredAssets.get(assetId) : null;
    const asset = assetId ? snapshot.assets.find((candidate) => candidate.id === assetId) : null;
    if (
      !descriptor ||
      descriptor.kind !== 'audio' ||
      !asset ||
      !isMatchingAudioAsset(asset, descriptor)
    ) {
      fail('effectAudioIntegrityFailure');
    }
    const clips = document.clips.filter((clip) => clip.layerId === layer.id);
    const effectiveClips = clips.length
      ? clips
      : [createWholeDocumentClip(layer.id, document.duration)];
    return effectiveClips.flatMap((clip, index) => {
      const plan = createEffectRuntimeAudioClipPlan({
        asset,
        clip,
        documentDuration: document.duration,
        index,
        instance,
        layer,
        sceneEnabled: isSceneEnabled(document.scenes, clip.sceneId),
        ...(targetAvailability.timelineInterval
          ? { targetInterval: targetAvailability.timelineInterval }
          : {}),
      });
      return plan ? [plan] : [];
    });
  });
}

function assertAudioSnapshotIntegrity(
  instance: VideoProjectEffectInstance,
  snapshot: VideoProjectEffectSnapshot,
  document: EffectV1Document
): void {
  if (
    document.id !== snapshot.documentId ||
    document.kind !== snapshot.kind ||
    !isEffectInstanceTimingEqual(document.duration, instance.duration * instance.playbackRate)
  ) {
    fail('effectAudioIntegrityFailure');
  }
}

function createWholeDocumentClip(layerId: string, duration: number): EffectClip {
  return { duration, layerId, offset: 0, start: 0 };
}

function isSceneEnabled(
  scenes: ReadonlyArray<{ enabled?: boolean; id: string }>,
  sceneId: string | null | undefined
): boolean {
  if (!sceneId) return true;
  return scenes.find((scene) => scene.id === sceneId)?.enabled !== false;
}

function isMatchingAudioAsset(
  asset: VideoProjectEffectSnapshotAsset,
  descriptor: { byteLength?: number; mimeType: string; sha256?: string }
): boolean {
  return (
    asset.kind === 'audio' &&
    asset.mimeType === descriptor.mimeType &&
    (descriptor.byteLength === undefined || asset.byteLength === descriptor.byteLength) &&
    (descriptor.sha256 === undefined || asset.sha256 === descriptor.sha256) &&
    asset.blob.size === asset.byteLength
  );
}

function resolveTargetAvailability(
  project: VideoProject,
  instance: VideoProjectEffectInstance
): EffectTargetAvailability {
  const target = instance.target;
  if (instance.kind === 'standalone') {
    if (target.kind !== 'scene') return { status: 'invalid' };
    const host = project.clips.find(
      (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
    );
    if (!host) return { status: 'invalid' };
    const track = project.tracks.find(({ id }) => id === host.trackId);
    return track?.visible === true
      ? {
          status: 'available',
          timelineInterval: { end: host.startTime + host.duration, start: host.startTime },
        }
      : { status: 'hidden' };
  }
  if (instance.kind === 'targetEffect') {
    if (target.kind !== 'clip') return { status: 'invalid' };
    const clip = project.clips.find(({ id }) => id === target.clipId);
    if (!clip) return { status: 'invalid' };
    return project.tracks.find(({ id }) => id === clip.trackId)?.visible === true
      ? {
          status: 'available',
          timelineInterval: { end: clip.startTime + clip.duration, start: clip.startTime },
        }
      : { status: 'hidden' };
  }
  if (target.kind !== 'transition') return { status: 'invalid' };
  const segment = buildProjectTransitionSegments(project).find(
    ({ id }) => id === target.transitionId
  );
  if (!segment) return { status: 'invalid' };
  const availability = resolveEffectTargetTrackAvailability(project, [
    segment.leadingClipId,
    segment.trailingClipId,
  ]);
  return availability === 'available'
    ? { status: 'available', timelineInterval: { end: segment.end, start: segment.start } }
    : { status: availability };
}

function parseSnapshot(snapshot: VideoProjectEffectSnapshot) {
  try {
    return parseEffectRuntimeSnapshotDocument(snapshot.source);
  } catch {
    fail('effectAudioIntegrityFailure');
  }
}

function fail(code: EffectRuntimeAudioPlanErrorCode): never {
  throw new EffectRuntimeAudioPlanError(code);
}
