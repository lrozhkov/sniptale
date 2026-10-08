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
  watermarkAssets?: ReadonlyMap<string, ProjectAssetEntry | null>;
}

/** Read under the lifecycle lock, before opening the consuming IDB transaction. */
export async function readReviewReadySources(aggregateId: string): Promise<ReviewReadySources> {
  const sources = new Map<string, ProjectAssetEntry | null>();
  const libraryAudioClaims: LibraryAudioClaim[] = [];
  const watermarkAssets = new Map<string, ProjectAssetEntry | null>();
  for (const journal of await listReadyJournals()) {
    if (journal.domain !== 'project-assets' || journal.operationId) continue;
    const payload = parseProjectAssetPayload(journal.payload);
    const ref = journal.assetRefs.length === 1 ? parseAssetRef(journal.assetRefs[0]) : null;
    if (
      !payload ||
      (payload.requiredReview && payload.requiredReview.aggregateId !== aggregateId) ||
      (payload.requiredReviewResource && payload.requiredReviewResource.aggregateId !== aggregateId)
    )
      continue;
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
    const target = payload.requiredReviewResource ? watermarkAssets : sources;
    const previous = target.get(payload.entry.id);
    target.set(
      payload.entry.id,
      previous !== undefined && previous?.assetId !== ref.assetId ? null : payload.entry
    );
  }
  return { assets: sources, libraryAudioClaims, watermarkAssets };
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
  const existing = collectReviewAssetReferences(previous);
  for (const reference of collectReviewAssetReferences(next)) {
    if (existing.has(reference)) continue;
    const id = reference.slice('project-asset:'.length);
    const watermark = reviewWorkspaceHasWatermarkImage(next, reference)
      ? prepared.watermarkAssets?.get(id)
      : undefined;
    const raw = await stores.assets.get(id);
    const asset =
      raw === undefined
        ? (claimed.get(id) ?? watermark ?? prepared.assets.get(id))
        : parseProjectAssetEntry(raw);
    if (!asset || asset.id !== id) return false;
    const claim = claimed.get(id);
    if (claim && claim.assetId !== asset.assetId) return false;
    if (asset.originMediaId) {
      const media = parseMediaLibraryEntry(await stores.media.get(asset.originMediaId));
      if (
        !media ||
        media.id !== asset.originMediaId ||
        (watermark && media.lifecycle?.trashedAt !== undefined)
      )
        return false;
    }
  }
  return true;
}
