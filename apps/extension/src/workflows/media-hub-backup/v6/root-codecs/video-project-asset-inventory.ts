import type { PortableVideoReview } from '../../../../composition/persistence/review-workspaces/backup-restore';
import { collectReviewAssetReferences } from '../../../../composition/persistence/review-workspaces/asset-refs';

const PROJECT_ASSET_PREFIX = 'project-asset:';
const INVALID_PROJECT_ASSET_INVENTORY = 'Portable video project asset inventory is inconsistent.';

interface PortableProjectAssetIdentity {
  entry: { id: string };
  objectId: string;
  videoReview?: PortableVideoReview;
}

interface PortableReviewOwner {
  videoReview?: PortableVideoReview;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectProjectAssetSourceIds(project: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const assets = project['assets'];
  if (!Array.isArray(assets)) return ids;
  for (const asset of assets) {
    if (!isRecord(asset) || !isRecord(asset['source'])) continue;
    const source = asset['source'];
    if (source['kind'] === 'project-asset' && typeof source['projectAssetId'] === 'string') {
      ids.add(source['projectAssetId']);
    }
  }
  return ids;
}

function addReviewAssetIds(ids: Set<string>, items: readonly PortableReviewOwner[]): void {
  for (const item of items) {
    if (!item.videoReview) continue;
    for (const reference of collectReviewAssetReferences(item.videoReview.workspace)) {
      if (!reference.startsWith(PROJECT_ASSET_PREFIX)) {
        throw new Error(INVALID_PROJECT_ASSET_INVENTORY);
      }
      ids.add(reference.slice(PROJECT_ASSET_PREFIX.length));
    }
  }
}

/** Enforces one exact portable entry for every stored project-asset dependency. */
export function assertExactPortableVideoProjectAssetInventory(args: {
  project: Record<string, unknown>;
  projectAssets: readonly PortableProjectAssetIdentity[];
  projectExports: readonly PortableReviewOwner[];
}): void {
  const entryIds = args.projectAssets.map((asset) => asset.entry.id);
  const objectIds = args.projectAssets.map((asset) => asset.objectId);
  if (new Set(entryIds).size !== entryIds.length || new Set(objectIds).size !== objectIds.length) {
    throw new Error(INVALID_PROJECT_ASSET_INVENTORY);
  }
  const expectedIds = collectProjectAssetSourceIds(args.project);
  addReviewAssetIds(expectedIds, args.projectAssets);
  addReviewAssetIds(expectedIds, args.projectExports);
  const actualIds = new Set(entryIds);
  if (actualIds.size !== expectedIds.size || [...actualIds].some((id) => !expectedIds.has(id))) {
    throw new Error(INVALID_PROJECT_ASSET_INVENTORY);
  }
}
