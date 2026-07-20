import { useCallback } from 'react';
import { deleteProjectAsset } from '../../../composition/persistence/projects/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types/index';
import { ensureRecordingAsset, importProjectAsset } from '../../project/operations/ops';
import type { VideoEditorImportPlacement } from '../../contracts/insertion';
import { toErrorMessage } from './helpers';
import type { UseVideoEditorActionHandlersParams, VideoEditorActionHandlers } from './types';

const logger = createLogger({ namespace: 'VideoEditorAssets' });
type ImportableProjectAssetType =
  | typeof VideoProjectAssetType.IMAGE
  | typeof VideoProjectAssetType.VIDEO
  | typeof VideoProjectAssetType.AUDIO;

function getProjectAssetId(asset: VideoProjectAsset): string | null {
  return asset.source.kind === 'project-asset' ? asset.source.projectAssetId : null;
}

async function cleanupStaleImportedAsset(asset: VideoProjectAsset): Promise<void> {
  const projectAssetId = getProjectAssetId(asset);
  if (!projectAssetId) {
    return;
  }

  try {
    await deleteProjectAsset(projectAssetId);
  } catch (cleanupError) {
    logger.warn('Failed to clean up stale imported project asset', cleanupError);
  }
}

async function isStaleImportedAsset(args: {
  asset: VideoProjectAsset;
  params: UseVideoEditorActionHandlersParams;
  targetProjectId: string;
}): Promise<boolean> {
  const currentProjectId = args.params.getCurrentProjectId?.() ?? args.params.project?.id ?? null;
  if (currentProjectId === args.targetProjectId) {
    return false;
  }

  await cleanupStaleImportedAsset(args.asset);
  return true;
}

async function importProjectAssetFile(
  file: File,
  assetType: ImportableProjectAssetType,
  params: UseVideoEditorActionHandlersParams,
  placement?: VideoEditorImportPlacement
): Promise<void> {
  if (!params.project) {
    return;
  }

  const targetProjectId = params.project.id;
  const asset = await importProjectAsset(file, assetType);
  if (await isStaleImportedAsset({ asset, params, targetProjectId })) {
    return;
  }

  params.upsertAsset(asset);
  params.addAssetClip(
    asset,
    placement?.trackId ?? null,
    placement?.startTime ?? params.currentTime,
    placement?.timelineLaneId
  );
}

async function importRecordedAudioFile(
  file: File,
  trim: { trimEnd: number; trimStart: number },
  params: UseVideoEditorActionHandlersParams
): Promise<void> {
  if (!params.project) {
    return;
  }

  const targetProjectId = params.project.id;
  const asset = await importProjectAsset(file, VideoProjectAssetType.AUDIO);
  if (await isStaleImportedAsset({ asset, params, targetProjectId })) {
    return;
  }

  params.upsertAsset(asset);
  const clipId = params.addAssetClip(asset, null, params.currentTime);
  if (!clipId) {
    return;
  }

  const assetDuration = Math.max(0.1, asset.metadata.duration ?? trim.trimEnd);
  const normalizedTrimStart = Math.max(0, Math.min(trim.trimStart, assetDuration - 0.1));
  const normalizedTrimEnd = Math.max(
    normalizedTrimStart + 0.1,
    Math.min(trim.trimEnd, assetDuration)
  );

  if (normalizedTrimStart > 0) {
    params.trimClipStart(clipId, params.currentTime + normalizedTrimStart);
    params.moveClip(clipId, params.currentTime);
  }

  params.trimClipEnd(clipId, params.currentTime + normalizedTrimEnd - normalizedTrimStart);
}

function useRecordingAssetHandler(params: UseVideoEditorActionHandlersParams) {
  return useCallback(
    async (sourceRecordingId: string) => {
      if (!params.project) {
        return;
      }

      try {
        const asset = await ensureRecordingAsset(params.project, sourceRecordingId);
        if (!asset) {
          return;
        }

        params.upsertAsset(asset);
        params.addAssetClip(asset, null, params.currentTime);
      } catch (assetError) {
        logger.error('Failed to add recording', assetError);
        params.setError(toErrorMessage(assetError));
      }
    },
    [params]
  );
}

function useProjectAssetImportHandler(
  assetType: ImportableProjectAssetType,
  failureLabel: string,
  params: UseVideoEditorActionHandlersParams
) {
  return useCallback(
    async (file: File, placement?: VideoEditorImportPlacement) => {
      try {
        await importProjectAssetFile(file, assetType, params, placement);
      } catch (assetError) {
        logger.error(`Failed to import ${failureLabel}`, assetError);
        params.setError(toErrorMessage(assetError));
      }
    },
    [assetType, failureLabel, params]
  );
}

export function useAssetHandlers(
  params: UseVideoEditorActionHandlersParams
): Pick<
  VideoEditorActionHandlers,
  | 'handleAddRecording'
  | 'handleImportAudio'
  | 'handleImportImage'
  | 'handleImportRecordedAudio'
  | 'handleImportVideo'
> {
  const handleAddRecording = useRecordingAssetHandler(params);
  const handleImportImage = useProjectAssetImportHandler(
    VideoProjectAssetType.IMAGE,
    'image',
    params
  );
  const handleImportVideo = useProjectAssetImportHandler(
    VideoProjectAssetType.VIDEO,
    'video',
    params
  );
  const handleImportAudio = useProjectAssetImportHandler(
    VideoProjectAssetType.AUDIO,
    'audio',
    params
  );
  const handleImportRecordedAudio = useCallback(
    async (file: File, trim: { trimEnd: number; trimStart: number }) => {
      try {
        await importRecordedAudioFile(file, trim, params);
      } catch (assetError) {
        logger.error('Failed to import recorded audio', assetError);
        params.setError(toErrorMessage(assetError));
      }
    },
    [params]
  );

  return {
    handleAddRecording,
    handleImportImage,
    handleImportVideo,
    handleImportAudio,
    handleImportRecordedAudio,
  };
}
