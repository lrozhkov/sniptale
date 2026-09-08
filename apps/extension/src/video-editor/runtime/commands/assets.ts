import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import { deleteProjectAsset } from '../../../composition/persistence/projects/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VideoProjectAssetType,
  VideoTrackKind,
  type VideoProjectAsset,
} from '../../../features/video/project/types/index';
import {
  ensureLibraryMediaAssets,
  ensureRecordingAssets,
  importProjectAsset,
} from '../../project/operations/ops';
import type {
  VideoEditorImportPlacement,
  VideoEditorAudioRecordingTarget,
} from '../../contracts/insertion';
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
  if (placement?.destination === 'materials') return;
  port.addAssetClip(
    asset,
    placement?.trackId ?? null,
    placement?.startTime ?? port.getCurrentTime(),
    placement?.timelineLaneId
  );
}

function isRecordingDestinationAvailable(
  port: AssetHandlerPort,
  target: VideoEditorAudioRecordingTarget | null | undefined
): boolean {
  const project = port.getCurrentProject();
  if (!project || project.id !== port.getCurrentProjectId()) return false;
  if (!target) return true;
  const track = project.tracks.find(({ id }) => id === target.trackId);
  return (
    project.id === target.projectId &&
    Number.isFinite(target.startTime) &&
    target.startTime >= 0 &&
    track?.kind === VideoTrackKind.AUDIO &&
    !track.locked
  );
}

async function importRecordedAudioFile(
  file: File,
  trim: { trimEnd: number; trimStart: number },
  port: AssetHandlerPort,
  target?: VideoEditorAudioRecordingTarget | null
): Promise<void> {
  if (!isRecordingDestinationAvailable(port, target))
    throw new Error('Recording destination unavailable');
  const targetProjectId = port.getCurrentProjectId()!;
  const insertionTime = target?.startTime ?? port.getCurrentTime();
  const asset = await importProjectAsset(file, VideoProjectAssetType.AUDIO);
  if (await isStaleImportedAsset({ asset, port, targetProjectId })) {
    throw new Error('Recording project changed');
  }
  if (!isRecordingDestinationAvailable(port, target)) {
    await cleanupStaleImportedAsset(asset);
    throw new Error('Recording destination unavailable');
  }
  const lease = port.beginProjectHistoryTransaction();
  if (lease === null) {
    await cleanupStaleImportedAsset(asset);
    throw new Error('Recording history unavailable');
  }
  try {
    port.upsertAsset(asset);
    const clipId = port.addAssetClip(asset, target?.trackId ?? null, insertionTime);
    if (!clipId) throw new Error('Recording insertion failed');
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
  } finally {
    port.endProjectHistoryTransaction(lease);
  }
}

function useRecordingAssetHandler(port: AssetHandlerPort) {
  const acquire = useMaterialAssetHandler(port, 'recording');
  return useCallback(
    async (sourceRecordingId: string) => {
      try {
        await acquire(sourceRecordingId);
      } catch (assetError) {
        if (assetError instanceof DOMException && assetError.name === 'AbortError') return;
        logger.error('Failed to add recording', assetError);
        port.setError(toErrorMessage(assetError, 'common.errors.actionFailed'));
      }
    },
    [acquire, port]
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
        toast.error(translate('videoEditor.app.materialsImportFailed'));
      }
    },
    [assetType, failureLabel, port]
  );
}

function useMaterialAssetHandler(port: AssetHandlerPort, kind: 'library' | 'recording') {
  const pending = useRef(new Map<string, Promise<void>>());
  const lifecycle = useRef(0);
  useEffect(() => {
    lifecycle.current += 1;
    return () => {
      lifecycle.current += 1;
    };
  }, []);

  return useCallback(
    (mediaId: string): Promise<void> => {
      const project = port.getCurrentProject();
      if (!project || project.id !== port.getCurrentProjectId()) {
        return Promise.reject(new Error(translate('videoEditor.app.materialsUnavailable')));
      }
      const key = JSON.stringify([project.id, mediaId]);
      const existing = pending.current.get(key);
      if (existing) return existing;
      const generation = lifecycle.current;
      const task = (async () => {
        const assets = await (
          kind === 'library' ? ensureLibraryMediaAssets : ensureRecordingAssets
        )(project, mediaId);
        if (assets.length === 0)
          throw new Error(translate('videoEditor.sidebar.libraryMediaUnavailable'));
        if (lifecycle.current !== generation || port.getCurrentProjectId() !== project.id) {
          await Promise.all(
            assets
              .filter((asset) => !project.assets.some(({ id }) => id === asset.id))
              .map(cleanupStaleImportedAsset)
          );
          throw new DOMException(translate('videoEditor.app.materialsUnavailable'), 'AbortError');
        }
        port.upsertAssets(assets);
      })().finally(() => pending.current.delete(key));
      pending.current.set(key, task);
      return task;
    },
    [kind, port]
  );
}

export function useAssetHandlers(
  port: AssetHandlerPort
): Pick<
  VideoEditorActionHandlers,
  | 'handleAddRecording'
  | 'handleAddLibraryMedia'
  | 'handleImportAudio'
  | 'handleImportImage'
  | 'handleImportRecordedAudio'
  | 'handleImportVideo'
> {
  const handleAddRecording = useRecordingAssetHandler(port);
  const handleAddLibraryMedia = useMaterialAssetHandler(port, 'library');
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
    async (
      file: File,
      trim: { trimEnd: number; trimStart: number },
      target?: VideoEditorAudioRecordingTarget | null
    ) => {
      try {
        await importRecordedAudioFile(file, trim, port, target);
      } catch (assetError) {
        logger.error('Failed to import recorded audio', assetError);
        throw assetError;
      }
    },
    [port]
  );

  return useMemo(
    () => ({
      handleAddRecording,
      handleAddLibraryMedia,
      handleImportImage,
      handleImportVideo,
      handleImportAudio,
      handleImportRecordedAudio,
    }),
    [
      handleAddRecording,
      handleAddLibraryMedia,
      handleImportAudio,
      handleImportImage,
      handleImportRecordedAudio,
      handleImportVideo,
    ]
  );
}
