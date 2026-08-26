import { assertSafeProjectAssetStorageInput } from '../../../features/media-hub/project-assets';
import {
  saveRecordingsBatchSafely,
  saveScreenshotMediaAssetSafely,
} from '../../../workflows/media-hub/store';
import type { GalleryImportController } from './controller-types';
import { registerGalleryImportAbortController } from './backup';
import type { GalleryBusyAction } from './shared';
import { resolveGalleryMediaImportMimeType } from '../media-import-profile';
import type { MediaFileImportConflictStrategy } from '../import-types';
import { hasPotentialMediaFileConflicts, inspectMediaFileConflicts } from './media-file-conflicts';

let mediaImportRunSequence = 0;

interface VideoFileMetadata {
  duration: number;
  height: number;
  width: number;
}

function loadVideoFileMetadata(file: File, signal: AbortSignal): Promise<VideoFileMetadata> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let hasDecodedFrame = false;
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.ondurationchange = null;
      video.onloadeddata = null;
      video.ontimeupdate = null;
      video.onerror = null;
      signal.removeEventListener('abort', fail);
      video.src = '';
      URL.revokeObjectURL(url);
    };
    const finish = () => {
      if (settled) return;
      if (
        !hasDecodedFrame ||
        !video.videoWidth ||
        !video.videoHeight ||
        !Number.isFinite(video.duration)
      )
        return;
      settled = true;
      const metadata = {
        duration: Math.max(0, video.duration),
        height: video.videoHeight,
        width: video.videoWidth,
      };
      cleanup();
      resolve(metadata);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Video metadata is unavailable.'));
    };
    const probeDuration = () => {
      finish();
      if (!settled) {
        try {
          video.currentTime = 1e101;
        } catch {
          fail();
        }
      }
    };
    const decodeFrame = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (!context) return fail();
        context.drawImage(video, 0, 0, 1, 1);
        hasDecodedFrame = true;
        finish();
      } catch {
        fail();
      }
    };
    const timeoutId = window.setTimeout(fail, 5_000);
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = probeDuration;
    video.ondurationchange = finish;
    video.onloadeddata = decodeFrame;
    video.ontimeupdate = finish;
    video.onerror = fail;
    signal.addEventListener('abort', fail, { once: true });
    video.src = url;
  });
}

async function importMediaFile(file: File, signal: AbortSignal): Promise<void> {
  const mimeType = resolveGalleryMediaImportMimeType(file);
  if (!mimeType) throw new Error('Unsupported media file.');
  assertSafeProjectAssetStorageInput(file, mimeType);
  const typedBlob = file.type === mimeType ? file : file.slice(0, file.size, mimeType);
  if (mimeType.startsWith('image/')) {
    await saveScreenshotMediaAssetSafely({ blob: typedBlob, filename: file.name, kind: 'image' });
    return;
  }
  const metadata = await loadVideoFileMetadata(file, signal);
  if (signal.aborted) throw new DOMException('Import cancelled.', 'AbortError');
  await saveRecordingsBatchSafely([
    {
      blob: typedBlob,
      filename: file.name,
      id: crypto.randomUUID(),
      mediaMetadata: { ...metadata, kind: 'video' },
      mimeType,
    },
  ]);
}

interface MediaFileOutcome {
  failed: boolean;
  imported: boolean;
}

async function processMediaFile(args: {
  file: File;
  isConflict: boolean;
  signal: AbortSignal;
}): Promise<MediaFileOutcome> {
  if (args.isConflict) return { failed: false, imported: false };
  if (!resolveGalleryMediaImportMimeType(args.file)) return { failed: true, imported: false };
  try {
    await importMediaFile(args.file, args.signal);
    return { failed: false, imported: true };
  } catch {
    if (args.signal.aborted) throw new DOMException('Import cancelled.', 'AbortError');
    return { failed: true, imported: false };
  }
}

async function runMediaFileImport(args: {
  controller: GalleryImportController;
  files: File[];
  conflictingIndexes: ReadonlySet<number>;
}) {
  const runId = `gallery-media-import-${Date.now()}-${++mediaImportRunSequence}`;
  const totalBytes = args.files.reduce((total, file) => total + file.size, 0);
  const abortController = new AbortController();
  const releaseAbortController = registerGalleryImportAbortController(runId, abortController);
  args.controller.actions.surface.setActiveImport({
    file: args.files[0]!,
    id: runId,
    kind: 'media-files',
    progress: { bytesRead: 0, bytesWritten: 0, currentFilename: null, rootsComplete: 0 },
    status: 'running',
    totalBytes,
    totalRoots: args.files.length,
  });

  let imported = 0;
  const failedFilenames: string[] = [];
  let processedBytes = 0;
  let skipped = 0;
  try {
    for (const [index, file] of args.files.entries()) {
      if (abortController.signal.aborted) break;
      args.controller.actions.surface.setActiveImport((current) =>
        current?.id === runId
          ? { ...current, progress: { ...current.progress, currentFilename: file.name } }
          : current
      );
      const outcome = await processMediaFile({
        file,
        isConflict: args.conflictingIndexes.has(index),
        signal: abortController.signal,
      }).catch(() => null);
      if (!outcome) break;
      if (outcome.imported) imported += 1;
      else skipped += 1;
      if (outcome.failed) failedFilenames.push(file.name);
      processedBytes += file.size;
      args.controller.actions.surface.setActiveImport((current) =>
        current?.id === runId
          ? {
              ...current,
              progress: {
                bytesRead: processedBytes,
                bytesWritten: processedBytes,
                currentFilename: file.name,
                rootsComplete: imported + skipped,
              },
            }
          : current
      );
    }
    args.controller.actions.surface.setActiveImport((current) =>
      current?.id === runId
        ? {
            ...current,
            result: {
              conflictsResolved: args.conflictingIndexes.size,
              imported,
              operationId: runId,
              skipped,
            },
            ...(failedFilenames.length > 0 ? { failedFilenames } : {}),
            status: abortController.signal.aborted
              ? 'cancelled'
              : imported === 0 && failedFilenames.length > 0
                ? 'failed'
                : 'completed',
          }
        : current
    );
    if (imported > 0) await args.controller.actions.storage.refresh();
  } finally {
    releaseAbortController();
  }
}

export function createImportMediaFilesAction(
  controller: GalleryImportController,
  withBusy: GalleryBusyAction
) {
  return async (files: File[], strategy?: MediaFileImportConflictStrategy) => {
    if (
      files.length === 0 ||
      controller.state.storage.activeImport?.status === 'running' ||
      controller.state.storage.activeImport?.status === 'cancelling'
    ) {
      return;
    }
    await withBusy(async () => {
      const inspection =
        strategy === 'duplicate' ||
        !hasPotentialMediaFileConflicts(files, controller.state.derived.allItems)
          ? { conflicts: [], conflictingIndexes: new Set<number>() }
          : await inspectMediaFileConflicts(files, controller.state.derived.allItems);
      if (strategy === undefined && inspection.conflicts.length > 0) {
        controller.actions.surface.setPendingMediaImport({
          conflicts: inspection.conflicts,
          files,
        });
        return;
      }
      controller.actions.surface.setPendingMediaImport(null);
      await runMediaFileImport({
        controller,
        files,
        conflictingIndexes: strategy === 'skip' ? inspection.conflictingIndexes : new Set<number>(),
      });
    });
    if (controller.refs.mediaImportInputRef.current) {
      controller.refs.mediaImportInputRef.current.value = '';
    }
  };
}
