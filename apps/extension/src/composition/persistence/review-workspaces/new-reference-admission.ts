import { listReadyJournals } from '../assets/opfs-store';
import { parseAssetRef } from '../assets/guards';
import { parseProjectAssetPayload } from '../projects/asset-publication-payload';
import { parseProjectAssetEntry } from '../projects/read-guards';
import type { ProjectAssetEntry } from '../projects/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { collectReviewAssetReferences } from './asset-refs';
import type { VideoWorkspace } from './contracts';

type ReadStore = { get(id: string): Promise<unknown> };

/** Read under the lifecycle lock, before opening the consuming IDB transaction. */
export async function readReviewReadySources(
  aggregateId: string
): Promise<ReadonlyMap<string, ProjectAssetEntry | null>> {
  const sources = new Map<string, ProjectAssetEntry | null>();
  for (const journal of await listReadyJournals()) {
    if (journal.domain !== 'project-assets' || journal.operationId) continue;
    const payload = parseProjectAssetPayload(journal.payload);
    const ref = journal.assetRefs.length === 1 ? parseAssetRef(journal.assetRefs[0]) : null;
    if (
      !payload ||
      payload.expectedAssetId !== null ||
      !ref ||
      (payload.requiredReview && payload.requiredReview.aggregateId !== aggregateId) ||
      payload.entry.assetId !== ref.assetId ||
      payload.entry.size !== ref.size ||
      payload.entry.mimeType !== ref.mimeType
    )
      continue;
    const previous = sources.get(payload.entry.id);
    sources.set(
      payload.entry.id,
      previous !== undefined && previous?.assetId !== ref.assetId ? null : payload.entry
    );
  }
  return sources;
}

/** Existing retained links stay editable; every new identity needs durable or ready authority. */
export async function areNewReviewSourcesAvailable(
  next: VideoWorkspace,
  previous: VideoWorkspace,
  stores: { assets: ReadStore; media: ReadStore },
  prepared: ReadonlyMap<string, ProjectAssetEntry | null>
): Promise<boolean> {
  const existing = collectReviewAssetReferences(previous);
  for (const reference of collectReviewAssetReferences(next)) {
    if (existing.has(reference)) continue;
    const id = reference.slice('project-asset:'.length);
    const raw = await stores.assets.get(id);
    const asset = raw === undefined ? prepared.get(id) : parseProjectAssetEntry(raw);
    if (!asset || asset.id !== id) return false;
    if (asset.originMediaId) {
      const media = parseMediaLibraryEntry(await stores.media.get(asset.originMediaId));
      if (!media || media.id !== asset.originMediaId) return false;
    }
  }
  return true;
}
