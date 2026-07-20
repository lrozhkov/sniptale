import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import type { VideoProject } from '../types';
import { VideoProjectClipType, VideoTrackKind } from '../types';
import { createEffectHostClip } from '../factories/overlay-clip';
import { buildProjectTransitionSegments } from '../transition/project';
import { readVerifiedCatalogDocument, type VerifiedCatalogAsset } from './catalog-reader';
import { ApplyEffectInstanceError } from './errors';
import type {
  VideoProjectEffectInstance,
  VideoProjectEffectSnapshot,
  VideoProjectEffectSnapshotAsset,
  VideoProjectEffectTarget,
} from './types';

const MAX_PROJECT_EFFECT_SNAPSHOT_BYTES = 512 * 1024 * 1024;

export async function applyEffectCatalogDocument(args: {
  catalog: EffectBundleCatalogEntry;
  documentId: string;
  instanceId: string;
  project: VideoProject;
  startTime: number;
  target: VideoProjectEffectTarget;
}): Promise<VideoProject> {
  const { assets, catalogDocument, document } = await readVerifiedCatalogDocument(
    args.catalog,
    args.documentId
  );
  assertTarget(document.kind, args.target, args.project);
  const snapshot = createSnapshot(catalogDocument, assets);
  const snapshots = await appendVerifiedSnapshot(args.project, snapshot);
  const timing = resolveInstanceTiming(
    document.duration,
    args.startTime,
    args.target,
    args.project
  );
  const instance: VideoProjectEffectInstance = {
    controls: Object.fromEntries(
      document.controls.map(({ defaultValue, id }) => [id, defaultValue])
    ),
    duration: timing.duration,
    enabled: true,
    id: args.instanceId,
    kind: document.kind,
    playbackRate: document.duration / timing.duration,
    snapshotId: snapshot.id,
    startTime: timing.startTime,
    target: args.target,
  };
  const clips =
    document.kind === 'standalone'
      ? [
          ...args.project.clips,
          createStandaloneHostClip(args.project, instance, catalogDocument.id),
        ]
      : args.project.clips;
  return {
    ...args.project,
    clips,
    effectInstances: [...(args.project.effectInstances ?? []), instance],
    effectSnapshots: snapshots,
  };
}

function createStandaloneHostClip(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  name: string
) {
  const overlayTrack = project.tracks.find(({ kind }) => kind === VideoTrackKind.OVERLAY);
  if (!overlayTrack) throw new ApplyEffectInstanceError('effectTargetMissing');
  return createEffectHostClip({
    duration: instance.duration,
    effectInstanceId: instance.id,
    name,
    projectHeight: project.height,
    projectWidth: project.width,
    startTime: instance.startTime,
    trackId: overlayTrack.id,
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
  document: EffectBundleCatalogEntry['documents'][number],
  verifiedAssets: VerifiedCatalogAsset[]
): VideoProjectEffectSnapshot {
  const assets: VideoProjectEffectSnapshotAsset[] = verifiedAssets.map(
    ({ asset, bytes, id, sha256 }) => ({
      blob: new Blob([bytes.slice().buffer], { type: asset.mimeType }),
      byteLength: bytes.byteLength,
      id,
      kind: asset.kind,
      mimeType: asset.mimeType,
      sha256,
    })
  );
  return {
    assets,
    documentId: document.id,
    id: `effect:${document.sha256}`,
    kind: document.kind,
    retainedByteLength:
      new TextEncoder().encode(document.source).byteLength +
      assets.reduce((total, asset) => total + asset.byteLength, 0),
    schemaVersion: 'sniptale.effect.v1',
    sha256: document.sha256,
    source: document.source,
  };
}

function assertTarget(
  kind: 'standalone' | 'targetEffect' | 'transition',
  target: VideoProjectEffectTarget,
  project: VideoProject
): void {
  const matches =
    (kind === 'standalone' && target.kind === 'scene') ||
    (kind === 'targetEffect' &&
      target.kind === 'clip' &&
      project.clips.some(
        ({ id, type }) =>
          id === target.clipId &&
          type !== VideoProjectClipType.AUDIO &&
          type !== VideoProjectClipType.EFFECT
      )) ||
    (kind === 'transition' &&
      target.kind === 'transition' &&
      project.transitions?.some(({ id }) => id === target.transitionId) &&
      !(project.effectInstances ?? []).some(
        (instance) =>
          instance.kind === 'transition' &&
          instance.target.kind === 'transition' &&
          instance.target.transitionId === target.transitionId
      ));
  if (!matches) throw new ApplyEffectInstanceError('effectKindTargetMismatch');
}

function resolveInstanceTiming(
  documentDuration: number,
  requestedStartTime: number,
  target: VideoProjectEffectTarget,
  project: VideoProject
): { duration: number; startTime: number } {
  if (target.kind !== 'transition') {
    return { duration: documentDuration, startTime: requestedStartTime };
  }
  const segment = buildProjectTransitionSegments(project).find(
    ({ id }) => id === target.transitionId
  );
  if (!segment || segment.end <= segment.start) {
    throw new ApplyEffectInstanceError('effectTargetMissing');
  }
  return { duration: segment.end - segment.start, startTime: segment.start };
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
