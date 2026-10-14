import { promoteReferencedMediaLifecycles } from '../library-lifecycle/promotion';
import { readLibrarySceneSource, sameLibrarySceneRef } from '../projects/library-scene-source';
import { listReadyJournals } from '../assets/opfs-store';
import { parseAssetRef } from '../assets/guards';
import {
  parseProjectAssetPayload,
  type ProjectAssetPublicationPayload,
} from '../projects/asset-publication-payload';
import { parseProjectAssetEntry } from '../projects/read-guards';
import type { ProjectAssetEntry } from '../projects/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import {
  collectReviewAssetReferences,
  reviewWorkspaceHasAudioClip,
  reviewWorkspaceHasWatermarkImage,
  reviewWorkspaceHasSceneResource,
  reviewWorkspaceHasSpeechReplacement,
  reviewWorkspaceHasAnnotationEffectResource,
} from './asset-refs';
import { readLibraryAudioSource, sameLibraryAudioRef } from '../projects/library-audio-source';
import type { AssetRef } from '../assets/contracts';
import type { VideoWorkspace } from './contracts';
import { initDB, PROJECT_ASSETS_STORE, ASSET_REFS_STORE } from '../infrastructure/indexed-db/core';
import { readAssetFile } from '../assets/opfs-store';
import { verifyReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/validation';
import type { ReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/types';

type ReadStore = { get(id: string): Promise<unknown> };

interface LibraryAudioClaim {
  assetId: string;
  clipId: string;
  entry: ProjectAssetEntry;
  available: boolean;
}

/** Ready source facts sampled under the same lifecycle lock as the consuming commit. */
interface ReviewReadySources {
  assets: ReadonlyMap<string, ProjectAssetEntry | null>;
  libraryAudioClaims: readonly LibraryAudioClaim[];
  resourceClaims?: readonly {
    payload: ProjectAssetPublicationPayload;
    available: boolean;
    ref?: AssetRef;
  }[];
  annotationEffectSources?: readonly {
    snapshot: ReviewAnnotationEffectSnapshot;
    resources: ReadonlyMap<string, string>;
  }[];
}

/** Read under the lifecycle lock, before opening the consuming IDB transaction. */
export async function readReviewReadySources(aggregateId: string): Promise<ReviewReadySources> {
  const sources = new Map<string, ProjectAssetEntry | null>();
  const libraryAudioClaims: LibraryAudioClaim[] = [];
  const resourceClaims: {
    payload: ProjectAssetPublicationPayload;
    available: boolean;
    ref?: AssetRef;
  }[] = [];
  for (const journal of await listReadyJournals()) {
    if (journal.domain !== 'project-assets' || journal.operationId) continue;
    const payload = parseProjectAssetPayload(journal.payload);
    const ref = journal.assetRefs.length === 1 ? parseAssetRef(journal.assetRefs[0]) : null;
    if (
      !payload ||
      (payload.requiredReview && payload.requiredReview.aggregateId !== aggregateId) ||
      (payload.requiredReviewResource &&
        payload.requiredReviewResource.aggregateId !== aggregateId) ||
      (payload.requiredReviewSpeech && payload.requiredReviewSpeech.aggregateId !== aggregateId) ||
      (payload.requiredReviewAnnotationEffect &&
        payload.requiredReviewAnnotationEffect.aggregateId !== aggregateId)
    )
      continue;
    if (
      payload.requiredReviewResource ||
      payload.requiredReviewSpeech ||
      payload.requiredReviewAnnotationEffect
    ) {
      resourceClaims.push({
        payload,
        available: !!ref && (await resourceClaimAvailable(payload, ref)),
        ...(ref ? { ref } : {}),
      });
      continue;
    }
    if (payload.librarySourceId && payload.requiredReview) {
      libraryAudioClaims.push({
        assetId: `project-asset:${payload.entry.id}`,
        clipId: payload.requiredReview.clipId,
        entry: payload.entry,
        available: !!ref && (await libraryAudioClaimAvailable(payload, ref)),
      });
      continue;
    }
    if (
      payload.expectedAssetId !== null ||
      !ref ||
      payload.entry.assetId !== ref.assetId ||
      payload.entry.size !== ref.size ||
      payload.entry.mimeType !== ref.mimeType
    )
      continue;
    const target = sources;
    const previous = target.get(payload.entry.id);
    target.set(
      payload.entry.id,
      previous !== undefined && previous?.assetId !== ref.assetId ? null : payload.entry
    );
  }
  return { assets: sources, libraryAudioClaims, resourceClaims };
}

/** Readonly metadata sampling finishes its transaction before any Blob or cryptographic await. */
async function readAnnotationResource(reference: string, prepared: ReviewReadySources) {
  const id = reference.slice('project-asset:'.length);
  const db = await initDB();
  const tx = db.transaction([PROJECT_ASSETS_STORE, ASSET_REFS_STORE], 'readonly');
  const raw: unknown = await tx.objectStore(PROJECT_ASSETS_STORE).get(id);
  const stored = parseProjectAssetEntry(raw);
  const rawRef: unknown = stored
    ? await tx.objectStore(ASSET_REFS_STORE).get(stored.assetId)
    : undefined;
  await tx.done;
  const claim = prepared.resourceClaims?.find(
    (value) =>
      value.available &&
      value.payload.requiredReviewAnnotationEffect &&
      value.payload.entry.id === id
  );
  const entry = raw === undefined ? claim?.payload.entry : stored;
  const ref = raw === undefined ? claim?.ref : parseAssetRef(rawRef);
  if (
    !entry ||
    !ref ||
    entry.id !== id ||
    entry.assetId !== ref.assetId ||
    entry.size !== ref.size ||
    entry.mimeType !== ref.mimeType
  )
    return undefined;
  return { blob: await readAssetFile(ref, id), physicalAssetId: ref.assetId };
}

/** New source bytes are sampled under lifecycle exclusion, never inside a write transaction. */
export async function verifyReviewAnnotationEffectSources(
  previous: VideoWorkspace,
  snapshots: readonly ReviewAnnotationEffectSnapshot[],
  prepared: ReviewReadySources
): Promise<ReviewReadySources> {
  const retained = new Map(
    previous.effectSnapshots?.map((snapshot) => [snapshot.id, snapshot]) ?? []
  );
  const annotationEffectSources: NonNullable<
    ReviewReadySources['annotationEffectSources']
  >[number][] = [];
  for (const snapshot of snapshots) {
    const existing = retained.get(snapshot.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(snapshot))
        throw new Error('Immutable annotation source changed.');
      continue;
    }
    const resources = new Map<string, string>();
    const verified = await verifyReviewAnnotationEffectSnapshot(
      snapshot,
      async (reference) => {
        const resource = await readAnnotationResource(reference, prepared);
        if (resource) resources.set(reference, resource.physicalAssetId);
        return resource?.blob;
      },
      new AbortController().signal
    );
    annotationEffectSources.push({ snapshot: verified.snapshot, resources });
  }
  return { ...prepared, annotationEffectSources };
}

async function libraryAudioClaimAvailable(
  payload: ProjectAssetPublicationPayload,
  ref: AssetRef
): Promise<boolean> {
  if (
    !payload.librarySourceId ||
    payload.entry.assetId !== ref.assetId ||
    payload.entry.mimeType !== ref.mimeType ||
    payload.entry.size !== ref.size
  )
    return false;
  try {
    const source = await readLibraryAudioSource(payload.librarySourceId);
    if (!sameLibraryAudioRef(source.ref, ref)) return false;
    if (source.entry)
      return (
        payload.entry.id === source.entry.id &&
        payload.expectedAssetId === ref.assetId &&
        payload.publishToLibrary !== false &&
        !payload.entry.originMediaId
      );
    return (
      payload.entry.originMediaId === source.mediaId &&
      payload.expectedAssetId === null &&
      payload.publishToLibrary === false
    );
  } catch {
    return false;
  }
}

function hasResourceClaim(
  workspace: VideoWorkspace,
  payload: ProjectAssetPublicationPayload
): boolean {
  const resource = payload.requiredReviewResource;
  const assetId = `project-asset:${payload.entry.id}`;
  const speech = payload.requiredReviewSpeech;
  if (payload.requiredReviewAnnotationEffect)
    return reviewWorkspaceHasAnnotationEffectResource(
      workspace,
      payload.requiredReviewAnnotationEffect,
      { assetId, mimeType: payload.entry.mimeType, byteLength: payload.entry.size }
    );
  if (speech)
    return reviewWorkspaceHasSpeechReplacement(
      workspace,
      speech.target,
      speech.replacementId,
      assetId
    );
  if (!resource) return false;
  return resource.slot === 'watermark'
    ? reviewWorkspaceHasWatermarkImage(workspace, assetId)
    : reviewWorkspaceHasSceneResource(workspace, resource.slot, resource.kind, assetId);
}

async function resourceClaimAvailable(
  payload: ProjectAssetPublicationPayload,
  ref: AssetRef
): Promise<boolean> {
  if (
    payload.entry.assetId !== ref.assetId ||
    payload.entry.size !== ref.size ||
    payload.entry.mimeType !== ref.mimeType
  )
    return false;
  const resource = payload.requiredReviewResource;
  if (!resource || resource.slot === 'watermark' || resource.acquisition !== 'library-binding')
    return payload.expectedAssetId === null;
  if (!payload.librarySourceId) return false;
  try {
    const source = await readLibrarySceneSource(payload.librarySourceId, resource.kind);
    if (!sameLibrarySceneRef(source.ref, ref)) return false;
    return source.entry
      ? payload.entry.id === source.entry.id &&
          payload.expectedAssetId === ref.assetId &&
          payload.publishToLibrary !== false &&
          !payload.entry.originMediaId
      : payload.entry.originMediaId === source.mediaId &&
          payload.expectedAssetId === null &&
          payload.publishToLibrary === false;
  } catch {
    return false;
  }
}

/** Existing links stay editable; a new acquisition is admitted even if its bytes were retained. */
export async function areNewReviewSourcesAvailable(
  next: VideoWorkspace,
  previous: VideoWorkspace,
  stores: { assets: ReadStore; media: ReadStore },
  prepared: ReviewReadySources
): Promise<boolean> {
  const claimed = new Map<string, ProjectAssetEntry>();
  for (const claim of prepared.libraryAudioClaims) {
    if (
      !reviewWorkspaceHasAudioClip(next, claim.clipId, claim.assetId) ||
      reviewWorkspaceHasAudioClip(previous, claim.clipId, claim.assetId)
    )
      continue;
    if (!claim.available) return false;
    const existing = claimed.get(claim.entry.id);
    if (existing && existing.assetId !== claim.entry.assetId) return false;
    claimed.set(claim.entry.id, claim.entry);
  }
  const resourceAssets = new Map<string, ProjectAssetEntry>();
  for (const claim of prepared.resourceClaims ?? []) {
    if (!hasResourceClaim(next, claim.payload) || hasResourceClaim(previous, claim.payload))
      continue;
    if (!claim.available) return false;
    const entry = claim.payload.entry;
    const existing = resourceAssets.get(entry.id);
    if (existing && existing.assetId !== entry.assetId) return false;
    resourceAssets.set(entry.id, entry);
  }
  const existing = collectReviewAssetReferences(previous);
  const previousSnapshots = new Map(
    previous.effectSnapshots?.map((snapshot) => [snapshot.id, snapshot]) ?? []
  );
  for (const snapshot of next.effectSnapshots ?? []) {
    const retained = previousSnapshots.get(snapshot.id);
    if (retained) {
      if (JSON.stringify(retained) !== JSON.stringify(snapshot)) return false;
      continue;
    }
    const verified = prepared.annotationEffectSources?.find(
      (value) => value.snapshot.id === snapshot.id
    );
    if (!verified || JSON.stringify(verified.snapshot) !== JSON.stringify(snapshot)) return false;
    for (const resource of snapshot.assets) {
      const id = resource.assetId.slice('project-asset:'.length);
      const raw = await stores.assets.get(id);
      const entry = raw === undefined ? resourceAssets.get(id) : parseProjectAssetEntry(raw);
      if (
        !entry ||
        entry.assetId !== verified.resources.get(resource.assetId) ||
        entry.mimeType !== resource.mimeType ||
        entry.size !== resource.byteLength
      )
        return false;
    }
  }
  const annotationAssets = new Set(
    next.effectSnapshots?.flatMap((snapshot) => snapshot.assets.map((asset) => asset.assetId)) ?? []
  );
  for (const reference of collectReviewAssetReferences(next)) {
    if (existing.has(reference)) continue;
    const id = reference.slice('project-asset:'.length);
    const resource = resourceAssets.get(id);
    const raw = await stores.assets.get(id);
    if (raw === undefined && annotationAssets.has(reference) && !resource) return false;
    const asset =
      raw === undefined
        ? (claimed.get(id) ?? resource ?? prepared.assets.get(id))
        : parseProjectAssetEntry(raw);
    if (!asset || asset.id !== id) return false;
    const claim = claimed.get(id) ?? resource;
    if (claim && claim.assetId !== asset.assetId) return false;
    if (asset.originMediaId) {
      const media = parseMediaLibraryEntry(await stores.media.get(asset.originMediaId));
      if (
        !media ||
        media.id !== asset.originMediaId ||
        (resource && media.lifecycle?.trashedAt !== undefined)
      )
        return false;
    }
  }
  return true;
}

/** Retain the primary Library source and its recording mirror in the accepted transaction. */
export async function promoteReviewPrimarySourceLifecycles(
  aggregateId: string,
  stores: {
    media: Parameters<typeof promoteReferencedMediaLifecycles>[0]['mediaStore'];
    recordings: Parameters<typeof promoteReferencedMediaLifecycles>[0]['recordingStore'];
  },
  now: number
): Promise<void> {
  await promoteReferencedMediaLifecycles({
    mediaIds: new Set([aggregateId]),
    mediaStore: stores.media,
    recordingStore: stores.recordings,
    now,
  });
}

/** Promote retained external sources only inside the accepted workspace transaction. */
export async function promoteReviewSourceLifecycles(
  workspace: VideoWorkspace,
  stores: {
    assets: ReadStore;
    media: Parameters<typeof promoteReferencedMediaLifecycles>[0]['mediaStore'];
    recordings: Parameters<typeof promoteReferencedMediaLifecycles>[0]['recordingStore'];
  },
  prepared: ReviewReadySources
): Promise<void> {
  const ready = new Map(prepared.assets);
  for (const claim of prepared.libraryAudioClaims)
    if (claim.available) ready.set(claim.entry.id, claim.entry);
  for (const claim of prepared.resourceClaims ?? [])
    if (claim.available) ready.set(claim.payload.entry.id, claim.payload.entry);
  const mediaIds = new Set<string>();
  for (const reference of collectReviewAssetReferences(workspace)) {
    const id = reference.slice('project-asset:'.length);
    const raw = await stores.assets.get(id);
    const asset = raw === undefined ? ready.get(id) : parseProjectAssetEntry(raw);
    if (!asset || asset.id !== id) continue;
    if (asset.originMediaId) mediaIds.add(asset.originMediaId);
    const mirrorId = `project-asset:${id}`;
    const mirror = parseMediaLibraryEntry(await stores.media.get(mirrorId));
    if (mirror?.source.kind === 'project-asset' && mirror.source.projectAssetId === id)
      mediaIds.add(mirrorId);
  }
  await promoteReferencedMediaLifecycles({
    mediaIds,
    mediaStore: stores.media,
    recordingStore: stores.recordings,
    now: workspace.updatedAt,
  });
}
