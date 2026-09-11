import type { GuideImageBlock } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { ScenarioAssetEntry } from '@sniptale/runtime-contracts/scenario/types/session';
import type { PreparedScenarioAssetEntry } from '../../composition/persistence/scenario/contracts';
import { mapScenarioAssetEntry } from '../../composition/persistence/scenario/store/project-records/helpers';
import { createScenarioAssetEntryFromBlob } from '../../composition/persistence/scenario/store/capture-step/assets';
import { dataUrlToBlob } from '../../platform/media-utils/data-url';

export async function prepareScenarioEditedCaptureAsset(args: {
  dataUrl: string;
  galleryAssetId?: string | null;
  projectId: string;
}): Promise<{ asset: ScenarioAssetEntry; entry: PreparedScenarioAssetEntry }> {
  const blob = await dataUrlToBlob(args.dataUrl);
  const { assetEntry: entry } = await createScenarioAssetEntryFromBlob({
    blob,
    galleryAssetId: args.galleryAssetId ?? null,
    projectId: args.projectId,
  });

  return { asset: mapScenarioAssetEntry(entry), entry };
}

/** Keeps the block layout and identity while accepting a new immutable edit version. */
export function buildScenarioEditedImageBlock(
  block: GuideImageBlock,
  assetId: string,
  editDocumentId: string
): GuideImageBlock {
  return { ...block, assetId, editDocumentId };
}
