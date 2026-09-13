import {
  assertSafeScenarioAssetStorageInput,
  isSafeScenarioAssetAudioMimeType,
} from '../../projects/guards/asset-policy';
import { dataUrlToBlob } from '../../../../../platform/media-utils/data-url';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import type { PreparedScenarioAssetEntry } from '../../contracts';
import { createScenarioAssetId } from '../project-records/helpers';
import { assertAssetWriteAdmission, writeBlobToAsset } from '../../../assets';

async function createScenarioAssetEntryRecord(args: {
  blob: Blob;
  galleryAssetId?: string | null;
  now: number;
  projectId: string;
  width: number;
  height: number;
  duration?: number;
}) {
  assertSafeScenarioAssetStorageInput(args.blob, args.blob.type || 'image/png');
  await assertAssetWriteAdmission(args.blob.size);
  const prepared = await writeBlobToAsset(args.blob, {
    mimeType: args.blob.type || 'image/png',
  });
  return {
    assetEntry: {
      assetId: prepared.ref.assetId,
      id: createScenarioAssetId(),
      projectId: args.projectId,
      galleryAssetId: args.galleryAssetId ?? null,
      mimeType: args.blob.type || 'image/png',
      width: args.width,
      height: args.height,
      ...(args.duration === undefined ? {} : { duration: args.duration }),
      createdAt: args.now,
      size: args.blob.size,
      assetRef: prepared.ref,
    } satisfies PreparedScenarioAssetEntry,
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

  return await createScenarioAssetEntryRecord({
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

/** Stages already decoded audio for atomic scenario publication; callers own cancellation. */
export async function createScenarioAudioAssetEntry(args: {
  blob: Blob;
  projectId: string;
  duration: number;
  galleryAssetId?: string | null;
}) {
  if (
    !isSafeScenarioAssetAudioMimeType(args.blob.type) ||
    !Number.isFinite(args.duration) ||
    args.duration <= 0 ||
    args.duration > 3600
  )
    throw new Error('Invalid scenario audio.');
  return createScenarioAssetEntryRecord({ ...args, now: Date.now(), width: 0, height: 0 });
}
