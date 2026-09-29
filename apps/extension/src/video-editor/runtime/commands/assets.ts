import { syncProjectSceneBackground } from '../../../features/video/project/scene/background';
import { isAudioRecordingRangeAvailable } from '../../project/operations/timeline-gaps';
import { addAssetClipToProject } from '../../project/state/asset-actions';
import { observeVideoEditorSave } from '../session/save-readiness';
import { requestVideoEditorSaveRetry } from '../session/save-retry';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import { translate } from '../../../platform/i18n';
import { createProjectAssetMediaId } from '../../../features/media-hub/media-id';
import { deleteProjectAsset } from '../../../composition/persistence/projects/index';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  VideoProjectAssetType,
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
  // A matching library identity denotes reused bytes, never an acquired import.
  if (
    !projectAssetId ||
    (asset.source.kind === 'project-asset' &&
      asset.source.originMediaId === createProjectAssetMediaId(projectAssetId))
  ) {
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

  if (placement?.destination === 'background' && assetType !== VideoProjectAssetType.IMAGE) return;
  const targetProjectId = project.id;
  const asset = await importProjectAsset(file, assetType);
  if (await isStaleImportedAsset({ asset, port, targetProjectId })) {
    return;
  }

  if (placement?.destination === 'background') {
    port.updateProject((current) => ({
      ...current,
      assets: [...current.assets.filter((item) => item.id !== asset.id), asset],
      ...syncProjectSceneBackground(current, { kind: 'image', assetId: asset.id }),
    }));
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
  return (
    project.id === target.projectId &&
    isAudioRecordingRangeAvailable(project, target.trackId, target.startTime, target.endTime)
  );
}

async function importRecordedAudioFile(
  file: File,
  trim: { trimEnd: number; trimStart: number },
  port: AssetHandlerPort,
  target?: VideoEditorAudioRecordingTarget | null,
  signal?: AbortSignal
): Promise<{ assetId: string; saveCycle: ReturnType<typeof observeVideoEditorSave> | null }> {
  signal?.throwIfAborted();
  if (!isRecordingDestinationAvailable(port, target))
    throw new Error('Recording destination unavailable');
  const targetProjectId = port.getCurrentProjectId()!;
  const insertionTime = target ? target.startTime + trim.trimStart : 0;
  const asset = await importProjectAsset(file, VideoProjectAssetType.AUDIO);
  if (signal?.aborted) {
    await cleanupStaleImportedAsset(asset);
    signal.throwIfAborted();
  }
  if (await isStaleImportedAsset({ asset, port, targetProjectId })) {
    throw new Error('Recording project changed');
  }
  if (!isRecordingDestinationAvailable(port, target)) {
    await cleanupStaleImportedAsset(asset);
    throw new Error('Recording destination unavailable');
  }
  if (signal?.aborted) {
    await cleanupStaleImportedAsset(asset);
    signal.throwIfAborted();
  }
  if (!target) {
    const saveCycle = signal ? observeVideoEditorSave(targetProjectId) : null;
    try {
      port.upsertAsset(asset);
      return { assetId: asset.id, saveCycle };
    } catch (error) {
      saveCycle?.cancel();
      await cleanupStaleImportedAsset(asset);
      throw error;
    }
  }
  const duration = asset.metadata.duration;
  if (
    !Number.isFinite(trim.trimStart) ||
    trim.trimStart < 0 ||
    !duration ||
    insertionTime + duration > target.endTime + 0.001
  ) {
    await cleanupStaleImportedAsset(asset);
    throw new Error('Recording exceeds destination');
  }
  const lease = port.beginProjectHistoryTransaction();
  if (lease === null) {
    await cleanupStaleImportedAsset(asset);
    throw new Error('Recording history unavailable');
  }
  const saveCycle = signal ? observeVideoEditorSave(targetProjectId) : null;
  try {
    port.updateProject((current) => {
      if (
        signal?.aborted ||
        current.id !== target.projectId ||
        !isAudioRecordingRangeAvailable(current, target.trackId, target.startTime, target.endTime)
      )
        throw new Error('Recording destination unavailable');
      const result = addAssetClipToProject(current, asset, target.trackId, insertionTime);
      if (!result.selectedClipId) throw new Error('Recording insertion failed');
      return result.project;
    });
  } catch (error) {
    saveCycle?.cancel();
    if (!port.getCurrentProject()?.assets.some((item) => item.id === asset.id))
      await cleanupStaleImportedAsset(asset);
    throw error;
  } finally {
    port.endProjectHistoryTransaction(lease);
  }
  return { assetId: asset.id, saveCycle };
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
  const recordedTakes = useRef(new WeakMap<Blob, { projectId: string; assetId: string }>());
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
      target?: VideoEditorAudioRecordingTarget | null,
      signal?: AbortSignal,
      take?: Blob
    ) => {
      try {
        signal?.throwIfAborted();
        const previous = take ? recordedTakes.current.get(take) : undefined;
        const project = port.getCurrentProject();
        let saveCycle: ReturnType<typeof observeVideoEditorSave> | null = null;
        if (
          previous &&
          project?.id === previous.projectId &&
          project.assets.some((asset) => asset.id === previous.assetId) &&
          (!target ||
            project.clips.some((clip) => 'assetId' in clip && clip.assetId === previous.assetId))
        ) {
          if (signal) saveCycle = observeVideoEditorSave(previous.projectId);
          requestVideoEditorSaveRetry();
        } else {
          const imported = await importRecordedAudioFile(file, trim, port, target, signal);
          saveCycle = imported.saveCycle;
          if (take)
            recordedTakes.current.set(take, {
              projectId: port.getCurrentProjectId()!,
              assetId: imported.assetId,
            });
        }
        if (signal) await saveCycle?.promise;
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
