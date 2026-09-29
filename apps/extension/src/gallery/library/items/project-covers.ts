import { getVideoProject, getProjectAsset } from '../../../composition/persistence/projects';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library';
import { getRecording } from '../../../composition/persistence/recordings';
import {
  getScenarioAsset,
  getScenarioProjectEntry,
} from '../../../composition/persistence/scenario/projects';
import { getScenarioAssetBlob } from '../../../composition/persistence/scenario/store/public';
import { buildGuidePreviewSteps } from '../../../features/scenario/project/step-projections';
import type { VideoProject, VideoProjectAsset } from '../../../features/video/project/types';
import type { GalleryItem } from './types';
import { renderImage, renderVideo } from './project-cover-rendering';

const MAX_ACTIVE = 3;
const MAX_PENDING = 24;
const MAX_RETAINED_COVERS = 24;
type CoverRequest = {
  controller: AbortController;
  promise: Promise<Blob | undefined>;
  persistentConsumers: number;
  signalConsumers: number;
};
const inFlight = new Map<string, CoverRequest>();
const retained = new Map<string, Blob>();
const waiting: Array<{ admit: () => void; discard: () => void }> = [];
let active = 0;

async function withSlot(
  work: () => Promise<Blob | undefined>,
  signal: AbortSignal
): Promise<Blob | undefined> {
  if (signal.aborted) return undefined;
  if (active >= MAX_ACTIVE) {
    const admitted = await new Promise<boolean>((resolve) => {
      const cancel = () => {
        const index = waiting.indexOf(entry);
        if (index >= 0) waiting.splice(index, 1);
        entry.discard();
      };
      const entry = {
        admit: () => {
          signal.removeEventListener('abort', cancel);
          resolve(true);
        },
        discard: () => {
          signal.removeEventListener('abort', cancel);
          resolve(false);
        },
      };
      if (waiting.length >= MAX_PENDING) waiting.shift()?.discard();
      waiting.push(entry);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    if (!admitted) return undefined;
  } else active += 1;
  try {
    if (signal.aborted) return undefined;
    return await work();
  } finally {
    // Reserve the released slot for the newest visible request before another caller arrives.
    const next = waiting.pop();
    if (next) next.admit();
    else active -= 1;
  }
}

/** Visible, used clips in timeline order. The source can still be absent at read time. */
export function getVideoCoverCandidates(project: VideoProject): VideoProjectAsset[] {
  const tracks = new Map(project.tracks.map((track) => [track.id, track]));
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  const seen = new Set<string>();
  return project.clips
    .filter(
      (clip) =>
        (clip.type === 'VIDEO' || clip.type === 'IMAGE') &&
        Number.isFinite(clip.duration) &&
        clip.duration > 0 &&
        tracks.get(clip.trackId)?.visible === true
    )
    .sort(
      (a, b) =>
        a.startTime - b.startTime ||
        (tracks.get(a.trackId)?.order ?? 0) - (tracks.get(b.trackId)?.order ?? 0) ||
        a.id.localeCompare(b.id)
    )
    .flatMap((clip) => {
      if (clip.type !== 'VIDEO' && clip.type !== 'IMAGE') return [];
      const asset = assets.get(clip.assetId);
      if (!asset || seen.has(asset.id)) return [];
      seen.add(asset.id);
      return [asset];
    });
}

async function readVideoAsset(asset: VideoProjectAsset): Promise<Blob | undefined> {
  switch (asset.source.kind) {
    case 'library-asset':
      return getMediaAssetBlob(asset.source.mediaId);
    case 'recording':
      return (await getRecording(asset.source.recordingId))?.file;
    case 'scenario-asset':
      return (await getScenarioAsset(asset.source.scenarioAssetId))?.file;
    case 'project-asset': {
      const result = await getProjectAsset(asset.source.projectAssetId);
      return result.status === 'ready' ? result.entry.file : undefined;
    }
  }
}

async function buildProjectCover(
  item: GalleryItem,
  signal: AbortSignal
): Promise<Blob | undefined> {
  if (signal.aborted) return undefined;
  if (item.type === 'video-project') {
    if (item.unavailableReason !== null) return undefined;
    const result = await getVideoProject(item.entityId);
    if (
      signal.aborted ||
      result.status !== 'ready' ||
      result.lifecycle?.trashedAt !== item.lifecycle?.trashedAt ||
      result.workspaceRevision !== item.workspaceRevision
    )
      return undefined;
    for (const asset of getVideoCoverCandidates(result.project)) {
      if (signal.aborted) return undefined;
      try {
        const blob = await readVideoAsset(asset);
        if (signal.aborted) return undefined;
        if (!blob) continue;
        return await (asset.type === 'IMAGE'
          ? renderImage(blob, signal)
          : renderVideo(blob, signal));
      } catch {
        if (signal.aborted) return undefined;
        /* Another visible source may still work. */
      }
    }
  }
  if (item.type === 'scenario') {
    if (item.project.availability !== 'available') return undefined;
    const entry = await getScenarioProjectEntry(item.entityId);
    if (
      signal.aborted ||
      !entry ||
      entry.lifecycle?.trashedAt !== item.lifecycle?.trashedAt ||
      entry.workspaceRevision !== item.workspaceRevision
    )
      return undefined;
    const steps = buildGuidePreviewSteps({ project: entry.project });
    for (const image of steps.flatMap((step) => step.images)) {
      if (signal.aborted) return undefined;
      try {
        const blob = await getScenarioAssetBlob(image.assetId);
        if (signal.aborted) return undefined;
        if (blob) return await renderImage(blob, signal, image);
      } catch {
        if (signal.aborted) return undefined;
        /* Try the next document image. */
      }
    }
  }
  return undefined;
}

function subscribe(request: CoverRequest, signal?: AbortSignal): Promise<Blob | undefined> {
  if (!signal) {
    request.persistentConsumers += 1;
    return request.promise;
  }
  if (signal.aborted) return Promise.resolve(undefined);
  request.signalConsumers += 1;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (blob: Blob | undefined) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      request.signalConsumers -= 1;
      resolve(blob);
    };
    const abort = () => {
      finish(undefined);
      if (request.signalConsumers === 0 && request.persistentConsumers === 0)
        request.controller.abort();
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void request.promise.then(finish);
  });
}

/** Generates a disposable Gallery poster; no presentation or workspace write occurs. */
export function getGalleryProjectCover(
  item: GalleryItem,
  signal?: AbortSignal
): Promise<Blob | undefined> {
  if (signal?.aborted) return Promise.resolve(undefined);
  if (
    (item.type === 'scenario' && item.project.availability !== 'available') ||
    (item.type === 'video-project' && item.unavailableReason !== null)
  ) {
    return Promise.resolve(undefined);
  }
  const key = [
    item.type,
    item.entityId ?? item.id,
    item.workspaceRevision ?? item.updatedAt,
    item.lifecycle?.trashedAt ?? 'active',
  ].join(':');
  const cached = retained.get(key);
  if (cached) {
    retained.delete(key);
    retained.set(key, cached);
    return Promise.resolve(cached);
  }
  const existing = inFlight.get(key);
  if (existing && !existing.controller.signal.aborted) return subscribe(existing, signal);
  const controller = new AbortController();
  const request: CoverRequest = {
    controller,
    persistentConsumers: 0,
    signalConsumers: 0,
    promise: Promise.resolve(undefined),
  };
  const pending = withSlot(() => buildProjectCover(item, controller.signal), controller.signal)
    .catch(() => undefined)
    .then((blob) => {
      if (blob && !controller.signal.aborted) {
        retained.set(key, blob);
        if (retained.size > MAX_RETAINED_COVERS) retained.delete(retained.keys().next().value!);
      }
      return controller.signal.aborted ? undefined : blob;
    });
  request.promise = pending;
  inFlight.set(key, request);
  void pending.finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  return subscribe(request, signal);
}
