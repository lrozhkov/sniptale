import { animationRuntimeDuration } from '../../../../../contracts/effect-runtime/animation';
import {
  isEffectInstanceSourceRangeValid,
  isEffectHostTimingValid,
} from '../../../project/effect-instance/timing';
import type { VideoProject } from '../../../project/types/index';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';
import type { EffectRuntimeAudioPlan } from './types';
export type { EffectRuntimeAudioPlan } from './types';

type EffectRuntimeAudioPlanErrorCode = 'effectAudioIntegrityFailure' | 'effectAudioTargetFailure';
export class EffectRuntimeAudioPlanError extends Error {
  constructor(readonly code: EffectRuntimeAudioPlanErrorCode) {
    super(`Effect runtime audio plan failed: ${code}`);
    this.name = 'EffectRuntimeAudioPlanError';
  }
}

/** Animation packages do not own audio. Ordinary project audio has its existing independent planner. */
export function resolveEffectRuntimeAudioPlans(project: VideoProject): EffectRuntimeAudioPlan[] {
  const snapshots = new Map(
    (project.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])
  );
  for (const instance of project.effectInstances ?? []) {
    if (!instance.enabled) continue;
    const snapshot = snapshots.get(instance.snapshotId);
    if (
      !snapshot ||
      snapshot.schemaVersion !== 'sniptale.animation.v1' ||
      snapshot.kind !== 'standalone' ||
      instance.kind !== 'standalone' ||
      snapshot.assets.length !== 0
    )
      throw new EffectRuntimeAudioPlanError('effectAudioIntegrityFailure');
    let document;
    try {
      document = parseEffectRuntimeSnapshotDocument(snapshot);
    } catch {
      throw new EffectRuntimeAudioPlanError('effectAudioIntegrityFailure');
    }
    if (
      document.id !== snapshot.documentId ||
      !isEffectInstanceSourceRangeValid(instance, animationRuntimeDuration(document))
    )
      throw new EffectRuntimeAudioPlanError('effectAudioIntegrityFailure');
    const host = project.clips.find(
      (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
    );
    if (instance.target.kind !== 'scene' || !host || !isEffectHostTimingValid(host, instance))
      throw new EffectRuntimeAudioPlanError('effectAudioTargetFailure');
  }
  return [];
}
