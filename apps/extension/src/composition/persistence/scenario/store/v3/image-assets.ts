import type { PreparedScenarioAssetEntry } from '../../contracts';
import { dataUrlToBlob } from '../../../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { createScenarioAssetId, mapScenarioAssetEntry } from '../project-records/helpers';
import { assertAssetWriteAdmission, writeBlobToAsset } from '../../../assets';

/** Prepares a file-backed v3 scenario image asset for the aggregate mutation owner. */
export async function stageScenarioV3ImageAsset(args: {
  dataUrl: string;
  galleryAssetId?: string | null;
  projectId: string;
}): Promise<{ asset: ScenarioAssetEntry; entry: PreparedScenarioAssetEntry }> {
  if (!isImageDataUrl(args.dataUrl)) {
    throw new Error('Unsupported scenario image data URL');
  }

  const blob = await dataUrlToBlob(args.dataUrl);
  const dimensions = await measureImageBlob(blob);
  await assertAssetWriteAdmission(blob.size);
  const prepared = await writeBlobToAsset(blob, { mimeType: blob.type || 'image/png' });
  const entry = {
    assetId: prepared.ref.assetId,
    id: createScenarioAssetId(),
    projectId: args.projectId,
    galleryAssetId: args.galleryAssetId ?? null,
    mimeType: blob.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    createdAt: Date.now(),
    size: blob.size,
    assetRef: prepared.ref,
  } satisfies PreparedScenarioAssetEntry;

  return { asset: mapScenarioAssetEntry(entry), entry };
}
