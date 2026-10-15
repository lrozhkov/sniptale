import type { AssetRef } from '../assets/contracts';
/** Metadata-only admission, with no publication or transaction effects. */
export function admitsLibrarySourceRef(
  ref: AssetRef | null,
  assetId: string,
  media: { size: number; mimeType: string },
  entry: { size: number; mimeType: string } | null
): ref is AssetRef {
  return (
    !!ref &&
    ref.assetId === assetId &&
    ref.size === media.size &&
    ref.mimeType === media.mimeType &&
    (!entry || (entry.size === ref.size && entry.mimeType === ref.mimeType))
  );
}
/** Complete immutable object identity, independent of catalogue publication. */
export function sameLibrarySourceRef(left: AssetRef, right: AssetRef): boolean {
  return (
    left.assetId === right.assetId &&
    left.location.kind === right.location.kind &&
    left.location.objectKey === right.location.objectKey &&
    left.size === right.size &&
    left.mimeType === right.mimeType &&
    left.sha256 === right.sha256 &&
    left.createdAt === right.createdAt
  );
}
