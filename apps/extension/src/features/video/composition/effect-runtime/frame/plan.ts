import {
  resolveAnimationObjectRenderBounds,
  resolveAnimationObjectBitmapBounds,
} from '@sniptale/runtime-contracts/animation-template';
import {
  animationRuntimeDuration,
  effectRuntimeFrameIndex,
} from '../../../../../contracts/effect-runtime/animation';
import { resolveEffectObjectControls } from '../../../project/effect-instance/layout';
import {
  isEffectInstanceSourceRangeValid,
  resolveEffectInstanceTime,
} from '../../../project/effect-instance/timing';
import type { VideoProject } from '../../../project/types/index';
import {
  assertEffectDecodedRaster,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
} from '../runtime/resource-limits';
import { parseEffectRuntimeSnapshotDocument } from '../runtime/snapshot-document';
import type { EffectRuntimeFramePlan } from '../runtime/types';
import { resolveEffectRuntimeFrameTarget } from './target';

type EffectRuntimePlanErrorCode = 'effectPlanIntegrityFailure' | 'effectPlanTargetFailure';
class EffectRuntimePlanError extends Error {
  constructor(readonly code: EffectRuntimePlanErrorCode) {
    super(`Effect runtime plan failed: ${code}`);
    this.name = 'EffectRuntimePlanError';
  }
}

/** One source clock and logical object geometry serve preview, caches, inspector and export. */
export function resolveEffectRuntimeFramePlans(
  project: VideoProject,
  projectTime: number
): EffectRuntimeFramePlan[] {
  const snapshots = new Map(
    (project.effectSnapshots ?? []).map((snapshot) => [snapshot.id, snapshot])
  );
  const plans: EffectRuntimeFramePlan[] = [];
  for (const instance of project.effectInstances ?? []) {
    if (!instance.enabled) continue;
    const snapshot = snapshots.get(instance.snapshotId);
    if (
      !snapshot ||
      snapshot.kind !== 'standalone' ||
      instance.kind !== 'standalone' ||
      snapshot.schemaVersion !== 'sniptale.animation.v1' ||
      snapshot.assets.length !== 0
    )
      throw new EffectRuntimePlanError('effectPlanIntegrityFailure');
    let document;
    try {
      document = parseEffectRuntimeSnapshotDocument(snapshot);
    } catch {
      throw new EffectRuntimePlanError('effectPlanIntegrityFailure');
    }
    const duration = animationRuntimeDuration(document);
    if (
      document.id !== snapshot.documentId ||
      !isEffectInstanceSourceRangeValid(instance, duration)
    )
      throw new EffectRuntimePlanError('effectPlanIntegrityFailure');
    const host = project.clips.find(
      (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
    );
    const timing = resolveEffectInstanceTime(instance, duration, projectTime, host);
    if (!timing) continue;
    const target = resolveEffectRuntimeFrameTarget(project, instance, projectTime);
    if (target === null) continue;
    if (!target || target.kind !== 'scene')
      throw new EffectRuntimePlanError('effectPlanTargetFailure');
    const controls = resolveEffectObjectControls(document, instance, target.placement);
    const bounds = resolveAnimationObjectRenderBounds(document, controls);
    const bitmapBounds = resolveAnimationObjectBitmapBounds(document, bounds);
    const width = target.placement.width * bitmapBounds.width,
      height = target.placement.height * bitmapBounds.height;
    if (![width, height].every((value) => Number.isFinite(value) && value > 0))
      throw new EffectRuntimePlanError('effectPlanTargetFailure');
    const density = Math.min(
      1,
      Math.sqrt(EFFECT_RUNTIME_RESOURCE_LIMITS.maxOutputPixels / (width * height))
    );
    const renderDimensions = {
      width: Math.max(1, Math.floor(width * density)),
      height: Math.max(1, Math.floor(height * density)),
    };
    assertEffectDecodedRaster(renderDimensions.width, renderDimensions.height);
    plans.push({
      assets: [],
      controls,
      bitmapBounds,
      dimensions: { width: bounds.width, height: bounds.height },
      renderDimensions,
      documentSha256: snapshot.sha256,
      documentSource: snapshot.source,
      duration,
      effectInstanceId: instance.id,
      fps: project.fps,
      frameIndex: effectRuntimeFrameIndex(timing.effectTime, project.fps),
      kind: 'standalone',
      progress: timing.progress,
      snapshotId: snapshot.id,
      target: { kind: 'scene', clipId: target.clipId },
      time: timing.effectTime,
    });
  }
  return plans;
}

/** Change physical sampling only; program coordinates and external object bounds remain logical. */
export function applyEffectRuntimeRasterDimensions(
  plan: EffectRuntimeFramePlan,
  dimensions: { width: number; height: number }
): EffectRuntimeFramePlan {
  assertEffectDecodedRaster(dimensions.width, dimensions.height);
  return { ...plan, renderDimensions: { ...dimensions } };
}
