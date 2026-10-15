/** Codec parameters are inspection metadata, not part of the stored container MIME. */
export function sameReviewSourceIdentity(
  ref: { assetId: string; size: number; mimeType: string },
  assetId: string,
  source: { size: number; mimeType: string }
): boolean {
  return (
    ref.assetId === assetId &&
    ref.size === source.size &&
    ref.mimeType.split(';', 1)[0]?.trim().toLowerCase() ===
      source.mimeType.split(';', 1)[0]?.trim().toLowerCase()
  );
}
