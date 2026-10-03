import type { getVideoProject, getProjectAsset } from '../../composition/persistence/projects';
import type { getMediaAssetBlob } from '../../composition/persistence/media-library';
import type { getRecording } from '../../composition/persistence/recordings';
import type {
  getScenarioAsset,
  getScenarioProjectEntry,
} from '../../composition/persistence/scenario/projects';
import type { getScenarioAssetBlob } from '../../composition/persistence/scenario/store/public';
import { buildGuidePreviewSteps } from '../../features/scenario/project/step-projections';
import type { VideoProject, VideoProjectAsset } from '../../features/video/project/types';
import { renderImage, renderVideo } from './rendering';

export interface ProjectCoverRequest {
  kind: 'scenario' | 'video-project';
  id: string;
  workspaceRevision: number;
  trashedAt?: number;
}
export interface ProjectCoverSources {
  getVideoProject: typeof getVideoProject;
  getProjectAsset: typeof getProjectAsset;
  getMediaAssetBlob: typeof getMediaAssetBlob;
  getRecording: typeof getRecording;
  getScenarioAsset: typeof getScenarioAsset;
  getScenarioProjectEntry: typeof getScenarioProjectEntry;
  getScenarioAssetBlob: typeof getScenarioAssetBlob;
}
const MAX_ACTIVE = 3;
const MAX_RETAINED_COVERS = 256;
const MAX_RETAINED_BYTES = 16 * 1024 * 1024;
type CoverRequest = {
  controller: AbortController;
  promise: Promise<Blob | undefined>;
  persistentConsumers: number;
  signalConsumers: number;
};
interface CoverState {
  inFlight: Map<string, CoverRequest>;
  retained: Map<string, Blob>;
  waiting: Array<{ admit: () => void; discard: () => void }>;
  active: number;
  retainedBytes: number;
}

async function withSlot(
  state: CoverState,
  work: () => Promise<Blob | undefined>,
  signal: AbortSignal
): Promise<Blob | undefined> {
  if (signal.aborted) return undefined;
  if (state.active >= MAX_ACTIVE) {
    const admitted = await new Promise<boolean>((resolve) => {
      const cancel = () => {
        const index = state.waiting.indexOf(entry);
        if (index >= 0) state.waiting.splice(index, 1);
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
      state.waiting.push(entry);
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    if (!admitted) return undefined;
  } else state.active += 1;
  try {
    if (signal.aborted) return undefined;
    return await work();
  } finally {
    // Live consumers bound the queue; cancellation removes requests that leave the viewport.
    // FIFO prevents starvation when a large viewport keeps more than 27 covers visible.
    const next = state.waiting.shift();
    if (next) next.admit();
    else state.active -= 1;
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

async function readVideoAsset(
  asset: VideoProjectAsset,
  sources: ProjectCoverSources
): Promise<Blob | undefined> {
  switch (asset.source.kind) {
    case 'library-asset':
      return sources.getMediaAssetBlob(asset.source.mediaId);
    case 'recording':
      return (await sources.getRecording(asset.source.recordingId))?.file;
    case 'scenario-asset':
      return (await sources.getScenarioAsset(asset.source.scenarioAssetId))?.file;
    case 'project-asset': {
      const result = await sources.getProjectAsset(asset.source.projectAssetId);
      return result.status === 'ready' ? result.entry.file : undefined;
    }
  }
}

async function buildProjectCover(
  item: ProjectCoverRequest,
  signal: AbortSignal,
  sources: ProjectCoverSources
): Promise<Blob | undefined> {
  if (signal.aborted) return undefined;
  if (item.kind === 'video-project') {
    const result = await sources.getVideoProject(item.id);
    if (
      signal.aborted ||
      result.status !== 'ready' ||
      result.lifecycle?.trashedAt !== item.trashedAt ||
      (result.workspaceRevision ?? 0) !== item.workspaceRevision
    )
      return undefined;
    for (const asset of getVideoCoverCandidates(result.project)) {
      if (signal.aborted) return undefined;
      try {
        const blob = await readVideoAsset(asset, sources);
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
  if (item.kind === 'scenario') {
    const entry = await sources.getScenarioProjectEntry(item.id);
    if (
      signal.aborted ||
      !entry ||
      entry.lifecycle?.trashedAt !== item.trashedAt ||
      (entry.workspaceRevision ?? 0) !== item.workspaceRevision
    )
      return undefined;
    const steps = buildGuidePreviewSteps({ project: entry.project });
    const candidates = [
      ...steps.flatMap((step) =>
        step.images.map((image) => ({ assetId: image.assetId, framing: image }))
      ),
      ...(entry.project.tour?.slides ?? []).flatMap((slide) =>
        slide.kind === 'image' && slide.image
          ? [{ assetId: slide.image.assetId, framing: undefined }]
          : []
      ),
    ];
    for (const image of candidates) {
      if (signal.aborted) return undefined;
      try {
        const blob = await sources.getScenarioAssetBlob(image.assetId);
        if (signal.aborted) return undefined;
        if (blob) return await renderImage(blob, signal, image.framing);
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

async function isCurrentCover(sources: ProjectCoverSources, item: ProjectCoverRequest) {
  const current =
    item.kind === 'video-project'
      ? await sources.getVideoProject(item.id)
      : await sources.getScenarioProjectEntry(item.id);
  return Boolean(
    current &&
    (!('status' in current) || current.status === 'ready') &&
    current.lifecycle?.trashedAt === item.trashedAt &&
    (current.workspaceRevision ?? 0) === item.workspaceRevision
  );
}

function requestCover(
  state: CoverState,
  sources: ProjectCoverSources,
  item: ProjectCoverRequest,
  signal?: AbortSignal
): Promise<Blob | undefined> {
  if (signal?.aborted) return Promise.resolve(undefined);
  const key = [item.kind, item.id, item.workspaceRevision, item.trashedAt ?? 'active'].join(':');
  const cached = state.retained.get(key);
  if (cached) {
    state.retained.delete(key);
    state.retained.set(key, cached);
    return isCurrentCover(sources, item)
      .then((current) => (current && !signal?.aborted ? cached : undefined))
      .catch(() => undefined);
  }
  const existing = state.inFlight.get(key);
  if (existing && !existing.controller.signal.aborted) return subscribe(existing, signal);
  const controller = new AbortController();
  const request: CoverRequest = {
    controller,
    persistentConsumers: 0,
    signalConsumers: 0,
    promise: Promise.resolve(undefined),
  };
  const pending = withSlot(
    state,
    () => buildProjectCover(item, controller.signal, sources),
    controller.signal
  )
    .catch(() => undefined)
    .then(async (blob) => {
      if (!blob || controller.signal.aborted || !(await isCurrentCover(sources, item)))
        return undefined;
      if (!controller.signal.aborted) {
        if (blob.size <= MAX_RETAINED_BYTES) {
          state.retainedBytes -= state.retained.get(key)?.size ?? 0;
          state.retained.set(key, blob);
          state.retainedBytes += blob.size;
          while (
            state.retained.size > MAX_RETAINED_COVERS ||
            state.retainedBytes > MAX_RETAINED_BYTES
          ) {
            const oldest = state.retained.keys().next().value!;
            state.retainedBytes -= state.retained.get(oldest)!.size;
            state.retained.delete(oldest);
          }
        }
      }
      return controller.signal.aborted ? undefined : blob;
    })
    .catch(() => undefined);
  request.promise = pending;
  state.inFlight.set(key, request);
  void pending.finally(() => {
    if (state.inFlight.get(key) === request) state.inFlight.delete(key);
  });
  return subscribe(request, signal);
}

/** Page-owned disposable cover cache; sources retain all persistence authority. */
export function createProjectCoverService(sources: ProjectCoverSources) {
  const state: CoverState = {
    inFlight: new Map(),
    retained: new Map(),
    waiting: [],
    active: 0,
    retainedBytes: 0,
  };
  return {
    getCover: (request: ProjectCoverRequest, signal?: AbortSignal) =>
      requestCover(state, sources, request, signal),
  };
}
