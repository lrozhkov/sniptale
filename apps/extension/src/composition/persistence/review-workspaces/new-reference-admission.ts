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
} from './asset-refs';
import { readLibraryAudioSource, sameLibraryAudioRef } from '../projects/library-audio-source';
import type { AssetRef } from '../assets/contracts';
import type { VideoWorkspace } from './contracts';

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
  resourceClaims?: readonly { payload: ProjectAssetPublicationPayload; available: boolean }[];
}

/** Read under the lifecycle lock, before opening the consuming IDB transaction. */
export async function readReviewReadySources(aggregateId: string): Promise<ReviewReadySources> {
  const sources = new Map<string, ProjectAssetEntry | null>();
  const libraryAudioClaims: LibraryAudioClaim[] = [];
  const resourceClaims: { payload: ProjectAssetPublicationPayload; available: boolean }[] = [];
  for (const journal of await listReadyJournals()) {
    if (journal.domain !== 'project-assets' || journal.operationId) continue;
    const payload = parseProjectAssetPayload(journal.payload);
    const ref = journal.assetRefs.length === 1 ? parseAssetRef(journal.assetRefs[0]) : null;
    if (
      !payload ||
      (payload.requiredReview && payload.requiredReview.aggregateId !== aggregateId) ||
      (payload.requiredReviewResource &&
        payload.requiredReviewResource.aggregateId !== aggregateId) ||
      (payload.requiredReviewSpeech && payload.requiredReviewSpeech.aggregateId !== aggregateId)
    )
      continue;
    if (payload.requiredReviewResource || payload.requiredReviewSpeech) {
      resourceClaims.push({
        payload,
        available: !!ref && (await resourceClaimAvailable(payload, ref)),
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
  for (const reference of collectReviewAssetReferences(next)) {
    if (existing.has(reference)) continue;
    const id = reference.slice('project-asset:'.length);
    const resource = resourceAssets.get(id);
    const raw = await stores.assets.get(id);
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
