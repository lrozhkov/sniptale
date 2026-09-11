import { applyInitialEffectPreset } from '../effect-bundle/catalog/presets';
import { normalizeVideoProjectTransition } from '../transition/template';
import { resolveEffectOwner } from './owner';
import { getCurrentLocale } from '../../../../platform/i18n';
import { resolveEffectV1ControlDefault } from '@sniptale/runtime-contracts/effect-v1';
import { getEffectInsertionError } from './placement';
import { initializeEffectSceneAnchors } from './layout';
import type { EffectV1ObjectLayout } from '@sniptale/runtime-contracts/effect-v1';
import type { EffectBundleCatalogEntry } from '../effect-bundle/catalog';
import type { VideoProject } from '../types';
import { createEffectHostClip } from '../factories/overlay-clip';
import { resolveVideoOverlayTrack } from '../factories/creation';
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
  standaloneDuration?: number;
  controlPresetId?: string;
  target: VideoProjectEffectTarget;
  trackId?: string;
  timelineLaneId?: string | null;
}): Promise<VideoProject> {
  const locale = getCurrentLocale();
  const { assets, catalogDocument, document } = await readVerifiedCatalogDocument(
    args.catalog,
    args.documentId
  );
  assertTarget(document.kind, args.target, args.project);
  const snapshot = createSnapshot(catalogDocument, assets);
  const snapshots = await appendVerifiedSnapshot(args.project, snapshot);
  if (
    args.standaloneDuration !== undefined &&
    (document.kind !== 'standalone' ||
      !Number.isFinite(args.standaloneDuration) ||
      args.standaloneDuration < 1 / args.project.fps ||
      args.standaloneDuration > 3600)
  )
    throw new ApplyEffectInstanceError('effectKindTargetMismatch');
  const timing = resolveInstanceTiming(
    args.standaloneDuration ?? document.duration,
    args.startTime,
    args.target,
    args.project
  );
  const instance: VideoProjectEffectInstance = {
    catalogPackId: args.catalog.packId,
    ...(document.kind === 'targetEffect' ? { rangeMode: 'owner' as const } : {}),
    controls: applyInitialEffectPreset(
      document,
      Object.fromEntries(
        document.controls.map((control) => [
          control.id,
          resolveEffectV1ControlDefault(control, locale),
        ])
      ),
      catalogDocument.presetPreferences,
      args.controlPresetId
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
  const overlayTrack =
    document.kind === 'standalone'
      ? resolveStandaloneTrack(
          args.project,
          timing.startTime,
          timing.duration,
          args.trackId,
          args.timelineLaneId
        )
      : null;
  const clips = overlayTrack
    ? [
        ...args.project.clips,
        createStandaloneHostClip(
          args.project,
          instance,
          '',
          overlayTrack.id,
          document.objectLayout
        ),
      ]
    : args.project.clips;
  if (overlayTrack && args.timelineLaneId)
    clips[clips.length - 1]!.timelineLaneId = args.timelineLaneId;
  const host = clips.find(
    (clip) => clip.type === 'EFFECT' && clip.effectInstanceId === instance.id
  );
  if (host && document.objectLayout?.handles?.length) {
    instance.sceneAnchors = initializeEffectSceneAnchors(document, host.transform, args.project)!;
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
    ...(args.target.kind === 'transition'
      ? {
          transitions: (args.project.transitions ?? []).map((junction) =>
            args.target.kind === 'transition' && junction.id === args.target.transitionId
              ? normalizeVideoProjectTransition({ ...junction, templateKind: 'CROSSFADE' })
              : junction
          ),
        }
      : {}),
    effectInstances: [
      ...(args.project.effectInstances ?? []).filter(
        (previous) =>
          !(
            args.target.kind === 'transition' &&
            previous.target.kind === 'transition' &&
            args.target.transitionId === previous.target.transitionId
          )
      ),
      instance,
    ],
    effectSnapshots: snapshots,
  };
}

function createStandaloneHostClip(
  project: VideoProject,
  instance: VideoProjectEffectInstance,
  name: string,
  trackId: string,
  objectLayout: EffectV1ObjectLayout | undefined
) {
  return createEffectHostClip({
    objectLayout,
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
    source: document.source!,
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
      (() => {
        const owner = resolveEffectOwner(project, target);
        return owner !== null && !owner.locked && owner.duration > 0;
      })()) ||
    (kind === 'transition' &&
      target.kind === 'transition' &&
      project.transitions?.some((junction) => {
        if (junction.id !== target.transitionId) return false;
        return [junction.leadingClipId, junction.trailingClipId].every((id) => {
          const clip = project.clips.find((item) => item.id === id);
          const track = project.tracks.find((item) => item.id === clip?.trackId);
          return clip && clip.type !== 'AUDIO' && track && !track.locked && track.role !== 'CAMERA';
        });
      }));
  if (!matches) throw new ApplyEffectInstanceError('effectKindTargetMismatch');
}

function resolveInstanceTiming(
  documentDuration: number,
  requestedStartTime: number,
  target: VideoProjectEffectTarget,
  project: VideoProject
): { duration: number; startTime: number } {
  if (target.kind === 'scene') return { duration: documentDuration, startTime: requestedStartTime };
  if (target.kind !== 'transition') {
    const clip = resolveEffectOwner(project, target);
    if (!clip || clip.duration <= 0) throw new ApplyEffectInstanceError('effectTargetMissing');
    return { duration: clip.duration, startTime: clip.startTime };
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
