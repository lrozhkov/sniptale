import { useCallback, useMemo } from 'react';
import { deleteProjectAsset } from '../../../composition/persistence/projects/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VideoProjectAssetType,
  type VideoProjectAsset,
} from '../../../features/video/project/types/index';
import { ensureRecordingAsset, importProjectAsset } from '../../project/operations/ops';
import type { VideoEditorImportPlacement } from '../../contracts/insertion';
import { toErrorMessage } from './helpers';
import type { AssetHandlerPort, VideoEditorActionHandlers } from './types';

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
  port: AssetHandlerPort;
  targetProjectId: string;
}): Promise<boolean> {
  const currentProjectId = args.port.getCurrentProjectId();
  if (currentProjectId === args.targetProjectId) {
    return false;
  }

  await cleanupStaleImportedAsset(args.asset);
  return true;
}

async function importProjectAssetFile(
  file: File,
  assetType: ImportableProjectAssetType,
  port: AssetHandlerPort,
  placement?: VideoEditorImportPlacement
): Promise<void> {
  const project = port.getCurrentProject();
  if (!project) {
    return;
  }

  const targetProjectId = project.id;
  const asset = await importProjectAsset(file, assetType);
  if (await isStaleImportedAsset({ asset, port, targetProjectId })) {
    return;
  }

  port.upsertAsset(asset);
  port.addAssetClip(
    asset,
    placement?.trackId ?? null,
    placement?.startTime ?? port.getCurrentTime(),
    placement?.timelineLaneId
  );
}

async function importRecordedAudioFile(
  file: File,
  trim: { trimEnd: number; trimStart: number },
  port: AssetHandlerPort
): Promise<void> {
  const project = port.getCurrentProject();
  if (!project) {
    return;
  }

  const targetProjectId = project.id;
  const asset = await importProjectAsset(file, VideoProjectAssetType.AUDIO);
  if (await isStaleImportedAsset({ asset, port, targetProjectId })) {
    return;
  }

  port.upsertAsset(asset);
  const insertionTime = port.getCurrentTime();
  const clipId = port.addAssetClip(asset, null, insertionTime);
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
    port.trimClipStart(clipId, insertionTime + normalizedTrimStart);
    port.moveClip(clipId, insertionTime);
  }

  port.trimClipEnd(clipId, insertionTime + normalizedTrimEnd - normalizedTrimStart);
}

function useRecordingAssetHandler(port: AssetHandlerPort) {
  return useCallback(
    async (sourceRecordingId: string) => {
      const project = port.getCurrentProject();
      if (!project) {
        return;
      }

      try {
        const asset = await ensureRecordingAsset(project, sourceRecordingId);
        if (!asset) {
          return;
        }

        port.upsertAsset(asset);
        port.addAssetClip(asset, null, port.getCurrentTime());
      } catch (assetError) {
        logger.error('Failed to add recording', assetError);
        port.setError(toErrorMessage(assetError, 'common.errors.actionFailed'));
      }
    },
    [port]
  );
}

function useProjectAssetImportHandler(
  assetType: ImportableProjectAssetType,
  failureLabel: string,
  port: AssetHandlerPort
) {
  return useCallback(
    async (file: File, placement?: VideoEditorImportPlacement) => {
      try {
        await importProjectAssetFile(file, assetType, port, placement);
      } catch (assetError) {
        logger.error(`Failed to import ${failureLabel}`, assetError);
        port.setError(toErrorMessage(assetError, 'common.errors.actionFailed'));
      }
    },
    [assetType, failureLabel, port]
  );
}

export function useAssetHandlers(
  port: AssetHandlerPort
): Pick<
  VideoEditorActionHandlers,
  | 'handleAddRecording'
  | 'handleImportAudio'
  | 'handleImportImage'
  | 'handleImportRecordedAudio'
  | 'handleImportVideo'
> {
  const handleAddRecording = useRecordingAssetHandler(port);
  const handleImportImage = useProjectAssetImportHandler(
    VideoProjectAssetType.IMAGE,
    'image',
    port
  );
  const handleImportVideo = useProjectAssetImportHandler(
    VideoProjectAssetType.VIDEO,
    'video',
    port
  );
  const handleImportAudio = useProjectAssetImportHandler(
    VideoProjectAssetType.AUDIO,
    'audio',
    port
  );
  const handleImportRecordedAudio = useCallback(
    async (file: File, trim: { trimEnd: number; trimStart: number }) => {
      try {
        await importRecordedAudioFile(file, trim, port);
      } catch (assetError) {
        logger.error('Failed to import recorded audio', assetError);
        port.setError(toErrorMessage(assetError, 'common.errors.actionFailed'));
      }
    },
    [port]
  );

  return useMemo(
    () => ({
      handleAddRecording,
      handleImportImage,
      handleImportVideo,
      handleImportAudio,
      handleImportRecordedAudio,
    }),
    [
      handleAddRecording,
      handleImportAudio,
      handleImportImage,
      handleImportRecordedAudio,
      handleImportVideo,
    ]
  );
}
