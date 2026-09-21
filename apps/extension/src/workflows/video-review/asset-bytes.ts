import { getProjectAsset } from '../../composition/persistence/projects';

/** Resolves a review clip reference into its stored asset bytes. */
export async function resolveReviewAssetBytes(assetId: string): Promise<Blob | null> {
  const prefix = 'project-asset:';
  if (!assetId.startsWith(prefix)) return null;
  const asset = await getProjectAsset(assetId.slice(prefix.length));
  return asset.status === 'ready' ? asset.entry.file : null;
}
