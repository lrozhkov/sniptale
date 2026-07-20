import { dataUrlToBlob } from '../../../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import type { ScenarioAssetEntry as DbScenarioAssetEntry } from '../../contracts';
import { createScenarioAssetId } from '../project-records/helpers';

function createScenarioAssetEntryRecord(args: {
  blob: Blob;
  galleryAssetId?: string | null;
  now: number;
  projectId: string;
  width: number;
  height: number;
}) {
  return {
    assetEntry: {
      id: createScenarioAssetId(),
      projectId: args.projectId,
      galleryAssetId: args.galleryAssetId ?? null,
      blob: args.blob,
      mimeType: args.blob.type || 'image/png',
      width: args.width,
      height: args.height,
      createdAt: args.now,
      size: args.blob.size,
    } satisfies DbScenarioAssetEntry,
    now: args.now,
  };
}

export async function createScenarioAssetEntryFromBlob(args: {
  blob: Blob;
  galleryAssetId?: string | null;
  projectId: string;
}) {
  const now = Date.now();
  const dimensions = await measureImageBlob(args.blob);

  return createScenarioAssetEntryRecord({
    blob: args.blob,
    ...(args.galleryAssetId === undefined ? {} : { galleryAssetId: args.galleryAssetId }),
    now,
    projectId: args.projectId,
    width: dimensions.width,
    height: dimensions.height,
  });
}

export async function createScenarioAssetEntry(args: {
  dataUrl: string;
  galleryAssetId?: string | null;
  projectId: string;
}) {
  return createScenarioAssetEntryFromBlob({
    blob: await dataUrlToBlob(args.dataUrl),
    ...(args.galleryAssetId === undefined ? {} : { galleryAssetId: args.galleryAssetId }),
    projectId: args.projectId,
  });
}
