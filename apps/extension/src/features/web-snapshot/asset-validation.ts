// policyStateIds: [] - raster MIME admission is immutable validation policy, not mutable authority.
import { WEB_SNAPSHOT_PACKAGE_POLICY } from './package-policy';
import { assertWebSnapshotMimeSignature } from './mime-signature';
import {
  assertWebSnapshotImageDimensionsWithinLimits,
  readWebSnapshotEncodedImageDimensionCandidates,
} from './screenshot-validation';

const RASTER_IMAGE_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export async function validateImportedWebSnapshotAsset(
  blob: Blob,
  mimeType: string,
  path: string
): Promise<void> {
  if (blob.size <= 0 || blob.size > WEB_SNAPSHOT_PACKAGE_POLICY.maxAssetEntryBytes) {
    throw new Error(`Page Package asset is empty or too large: ${path}.`);
  }
  const header = new Uint8Array(await blob.slice(0, Math.min(blob.size, 65_536)).arrayBuffer());
  assertWebSnapshotMimeSignature(header, mimeType, path);
  if (!RASTER_IMAGE_MIME_TYPES.has(mimeType)) return;
  const geometryBytes =
    mimeType === 'image/avif' || mimeType === 'image/gif'
      ? new Uint8Array(await blob.arrayBuffer())
      : header;
  const encodedDimensions = readWebSnapshotEncodedImageDimensionCandidates(geometryBytes, mimeType);
  if (encodedDimensions.length === 0) {
    throw new Error(`Page Package image asset is invalid: ${path}.`);
  }
  for (const dimensions of encodedDimensions) {
    assertWebSnapshotImageDimensionsWithinLimits(
      dimensions,
      `Page Package image asset dimensions exceed safe limits: ${path}.`
    );
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`Page Package image asset is invalid: ${path}.`);
  }
  try {
    assertWebSnapshotImageDimensionsWithinLimits(
      { height: bitmap.height, width: bitmap.width },
      `Page Package image asset dimensions exceed safe limits: ${path}.`
    );
    if (
      !encodedDimensions.some(
        (dimensions) => dimensions.width === bitmap.width && dimensions.height === bitmap.height
      )
    )
      throw new Error(`Page Package image asset dimensions are invalid: ${path}.`);
  } finally {
    bitmap.close();
  }
}
