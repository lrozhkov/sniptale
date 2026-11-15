import { applyInitialEffectPreset } from '../effect-bundle/catalog/presets';
import { getCurrentLocale } from '../../../../platform/i18n';
import { resolveEffectControlDefault } from '@sniptale/runtime-contracts/effect-controls';
import { getEffectInsertionError } from './placement';
import { initializeEffectSceneAnchors } from './layout';
import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';
import { animationRuntimeDuration } from '../../../../contracts/effect-runtime/animation';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import type { VideoProject } from '../types';
import { createEffectHostClip } from '../factories/overlay-clip';
import { resolveVideoOverlayTrack } from '../factories/creation';
import { readVerifiedCatalogDocument } from './catalog-reader';
import { ApplyEffectInstanceError } from './errors';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
  VideoProjectEffectTarget,
} from './types';

const MAX_PROJECT_EFFECT_SNAPSHOT_BYTES = 512 * 1024 * 1024;

export async function applyEffectCatalogDocument(args: {
  catalog: EffectBundleCatalogEntry;
  documentId: string;
  instanceId: string;
  project: VideoProject;
  startTime: number;
  standaloneDuration?: number;
  controlPresetId?: string;
  target: VideoProjectEffectTarget;
  trackId?: string;
  timelineLaneId?: string | null;
}): Promise<VideoProject> {
  if (args.target.kind !== 'scene') throw new ApplyEffectInstanceError('effectKindTargetMismatch');
  const locale = getCurrentLocale();
  const { catalogDocument, document } = await readVerifiedCatalogDocument(
    args.catalog,
    args.documentId
  );
  const snapshot = createSnapshot(catalogDocument);
  const snapshots = await appendVerifiedSnapshot(args.project, snapshot);
  if (
    args.standaloneDuration !== undefined &&
    (!Number.isFinite(args.standaloneDuration) ||
      args.standaloneDuration < 1 / args.project.fps ||
      args.standaloneDuration > 3600)
  )
    throw new ApplyEffectInstanceError('effectKindTargetMismatch');
  const timing = {
    duration: args.standaloneDuration ?? animationRuntimeDuration(document),
    startTime: args.startTime,
  };
  const instance: VideoProjectEffectInstance = {
    catalogPackId: args.catalog.packId,
    controls: applyInitialEffectPreset(
      document,
      Object.fromEntries(
        document.controls.map((control) => [
          control.id,
          resolveEffectControlDefault(control, locale),
        ])
      ),
      catalogDocument.presetPreferences,
      args.controlPresetId
    ),
    duration: timing.duration,
    enabled: true,
    id: args.instanceId,
    kind: 'standalone',
    playbackRate: animationRuntimeDuration(document) / timing.duration,
    snapshotId: snapshot.id,
    startTime: timing.startTime,
    target: args.target,
  };
  const overlayTrack = resolveStandaloneTrack(
    args.project,
    timing.startTime,
    timing.duration,
    args.trackId,
    args.timelineLaneId
  );
  const clips = overlayTrack
    ? [
        ...args.project.clips,
        createStandaloneHostClip(args.project, instance, '', overlayTrack.id, document),
      ]
    : args.project.clips;
  if (overlayTrack && args.timelineLaneId)
    clips[clips.length - 1]!.timelineLaneId = args.timelineLaneId;
  const host = clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
  );
  if (host && document.objectLayout?.handles?.length) {
    instance.sceneAnchors = initializeEffectSceneAnchors(document, host.transform)!;
    for (const handle of document.objectLayout.handles) {
      delete instance.controls[handle.xControl];
      delete instance.controls[handle.yControl];
    }
  }
  return {
    ...args.project,
    clips,
    tracks:
      overlayTrack && !args.project.tracks.includes(overlayTrack)
        ? [...args.project.tracks, overlayTrack]
        : args.project.tracks,
    effectInstances: [...(args.project.effectInstances ?? []), instance],
    effectSnapshots: snapshots,
  };
}

function createStandaloneHostClip(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  name: string,
  trackId: string,
  document: AnimationTemplate
) {
  return createEffectHostClip({
    dimensions: { width: document.animation.w, height: document.animation.h },
    duration: instance.duration,
    effectInstanceId: instance.id,
    name,
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: instance.startTime,
    trackId,
  });
}

async function appendVerifiedSnapshot(
  project: VideoProject,
  snapshot: VideoProjectEffectSnapshot
): Promise<VideoProjectEffectSnapshot[]> {
  const snapshots = [...(project.effectSnapshots ?? [])];
  const existing = snapshots.find(({ id }) => id === snapshot.id);
  if (existing && !(await snapshotsEqual(existing, snapshot))) {
    throw new ApplyEffectInstanceError('effectCatalogIntegrityFailure');
  }
  if (!existing) snapshots.push(snapshot);
  const retainedBytes = snapshots.reduce((total, current) => total + current.retainedByteLength, 0);
  if (retainedBytes > MAX_PROJECT_EFFECT_SNAPSHOT_BYTES) {
    throw new ApplyEffectInstanceError('effectProjectQuotaExceeded');
  }
  return snapshots;
}

function createSnapshot(
  document: EffectBundleCatalogEntry['documents'][number]
): VideoProjectEffectSnapshot {
  if (document.source === undefined)
    throw new ApplyEffectInstanceError('effectCatalogIntegrityFailure');
  return {
    assets: [],
    documentId: document.id,
    id: `effect:${document.sha256}`,
    kind: 'standalone',
    retainedByteLength: new TextEncoder().encode(document.source).byteLength,
    schemaVersion: 'sniptale.animation.v1',
    sha256: document.sha256,
    source: document.source,
  };
}

async function snapshotsEqual(
  left: VideoProjectEffectSnapshot,
  right: VideoProjectEffectSnapshot
): Promise<boolean> {
  if (
    left.source !== right.source ||
    left.sha256 !== right.sha256 ||
    left.assets.length !== right.assets.length
  ) {
    return false;
  }
  for (let index = 0; index < left.assets.length; index += 1) {
    const leftAsset = left.assets[index]!;
    const rightAsset = right.assets[index]!;
    if (
      leftAsset.sha256 !== rightAsset.sha256 ||
      !equalBytes(
        new Uint8Array(await leftAsset.blob.arrayBuffer()),
        new Uint8Array(await rightAsset.blob.arrayBuffer())
      )
    ) {
      return false;
    }
  }
  return true;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => right[index] === byte);
}

function resolveStandaloneTrack(
  project: VideoProject,
  start: number,
  duration: number,
  trackId: string | undefined,
  timelineLaneId?: string | null
) {
  if (!Number.isFinite(start) || start < 0)
    throw new ApplyEffectInstanceError('effectTargetMissing');
  if (trackId === undefined) {
    if (timelineLaneId) throw new ApplyEffectInstanceError('effectTargetMissing');
    return resolveVideoOverlayTrack(project, start, duration);
  }
  const error = getEffectInsertionError(project, trackId, start, duration, timelineLaneId);
  if (error) throw new ApplyEffectInstanceError(error);
  return project.tracks.find((track) => track.id === trackId)!;
}
