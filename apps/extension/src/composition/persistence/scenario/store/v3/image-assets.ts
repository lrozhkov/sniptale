import type { ScenarioAssetEntry as DbScenarioAssetEntry } from '../../contracts';
import { dataUrlToBlob } from '../../../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { createScenarioAssetId, mapScenarioAssetEntry } from '../project-records/helpers';

/** Prepares a file-backed v3 scenario image asset for the aggregate mutation owner. */
export async function prepareScenarioV3ImageAsset(args: {
  dataUrl: string;
  galleryAssetId?: string | null;
  projectId: string;
}): Promise<{ asset: ScenarioAssetEntry; entry: DbScenarioAssetEntry }> {
  if (!isImageDataUrl(args.dataUrl)) {
    throw new Error('Unsupported scenario image data URL');
  }

  const blob = await dataUrlToBlob(args.dataUrl);
  const dimensions = await measureImageBlob(blob);
  const entry = {
    id: createScenarioAssetId(),
    projectId: args.projectId,
    galleryAssetId: args.galleryAssetId ?? null,
    blob,
    mimeType: blob.type || 'image/png',
    width: dimensions.width,
    height: dimensions.height,
    createdAt: Date.now(),
    size: blob.size,
  } satisfies DbScenarioAssetEntry;

  return { asset: mapScenarioAssetEntry(entry), entry };
}
