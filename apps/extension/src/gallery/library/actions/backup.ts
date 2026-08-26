import {
  createMediaHubBackupExportOptions,
  exportMediaHubBackup,
  importMediaHubBackup,
  inspectLocalMediaHubBackup,
  inspectMediaHubBackup,
  listResumableMediaHubRestores,
  readMediaHubRestoreSummary,
  resumeMediaHubBackupImport,
  type MediaHubBackupExportOptions,
  type MediaHubImportConflictStrategy,
} from '../../../workflows/media-hub-backup/index';
import type { GalleryBackupExportController, GalleryImportController } from './controller-types';
import type { GalleryItem } from '../items';
import { isGalleryMediaItem, isGalleryScenarioItem, isGalleryVideoProjectItem } from '../items';
import { type GalleryBusyAction } from './shared';

const activeBackupExportAbortControllers = new WeakMap<
  GalleryBackupExportController,
  AbortController
>();
const activeImportAbortControllers = new Map<string, AbortController>();
let importRunSequence = 0;

function buildSelectedBackupScope(
  items: GalleryItem[]
): NonNullable<MediaHubBackupExportOptions['selected']> {
  return {
    mediaAssetIds: items.filter(isGalleryMediaItem).map((item) => item.entityId ?? item.id),
    scenarioProjectIds: items.filter(isGalleryScenarioItem).map((item) => item.entityId),
    videoProjectIds: items.filter(isGalleryVideoProjectItem).map((item) => item.entityId),
  };
}

function hasSelectedBackupScope(
  selected: NonNullable<MediaHubBackupExportOptions['selected']>
): boolean {
  return Boolean(
    selected &&
    (selected.mediaAssetIds.length > 0 ||
      selected.scenarioProjectIds.length > 0 ||
      selected.videoProjectIds.length > 0)
  );
}

export function createSelectedBackupExportOptions(
  items: GalleryItem[]
): MediaHubBackupExportOptions | null {
  const selected = buildSelectedBackupScope(items);
  if (!hasSelectedBackupScope(selected)) return null;

  return createMediaHubBackupExportOptions({
    includeDrafts: items.some((item) => item.lifecycle?.storageClass === 'temporary'),
    scope: 'selected',
    selected,
  });
}

function createInitialBackupExportOptions(
  controller: GalleryBackupExportController
): MediaHubBackupExportOptions {
  return (
    createSelectedBackupExportOptions(controller.state.selection.selectedItems) ??
    createMediaHubBackupExportOptions()
  );
}

export function createExportBackupAction(
  controller: GalleryBackupExportController,
  withBusy: GalleryBusyAction
) {
  return async () => {
    const activeImport = controller.state.storage.activeImport;
    if (activeImport?.status === 'running' || activeImport?.status === 'cancelling') return;
    await withBusy(async () => {
      const options = createInitialBackupExportOptions(controller);
      const summary = await inspectLocalMediaHubBackup(options);
      controller.actions.surface.setPendingExport({ options, summary });
    });
  };
}

export function createConfirmExportBackupAction(controller: GalleryBackupExportController) {
  return async (options: MediaHubBackupExportOptions, withBusy: GalleryBusyAction) => {
    await withBusy(async () => {
      activeBackupExportAbortControllers.get(controller)?.abort();
      const abortController = new AbortController();
      activeBackupExportAbortControllers.set(controller, abortController);
      try {
        const summary = await inspectLocalMediaHubBackup(options);
        if (abortController.signal.aborted) {
          return;
        }
        controller.actions.surface.setPendingExport({ options, summary });
        await exportMediaHubBackup(options, { signal: abortController.signal });
        if (abortController.signal.aborted) {
          return;
        }
        controller.actions.surface.setPendingExport(null);
        await controller.actions.storage.refresh();
      } finally {
        if (activeBackupExportAbortControllers.get(controller) === abortController) {
          activeBackupExportAbortControllers.delete(controller);
        }
      }
    });
  };
}

export function createClosePendingExportAction(controller: GalleryBackupExportController) {
  return () => {
    activeBackupExportAbortControllers.get(controller)?.abort();
    activeBackupExportAbortControllers.delete(controller);
    controller.actions.surface.setPendingExport(null);
  };
}

export function createInspectExportBackupAction() {
  return async (options: MediaHubBackupExportOptions) => inspectLocalMediaHubBackup(options);
}

export function createImportSelectedFileAction(controller: GalleryImportController) {
  return async (file: File | null, withBusy: GalleryBusyAction) => {
    if (
      !file ||
      controller.state.storage.activeImport?.status === 'running' ||
      controller.state.storage.activeImport?.status === 'cancelling'
    ) {
      return;
    }

    await withBusy(async () => {
      const summary = await inspectMediaHubBackup(file);
      const resumable = (await listResumableMediaHubRestores()).find(
        (session) => session.archiveFingerprint === summary.archiveFingerprint
      );
      controller.actions.surface.setPendingImport({
        file,
        ...(resumable
          ? {
              resumeOperationId: resumable.operationId,
              resumeStrategy: resumable.strategy,
            }
          : {}),
        summary,
      });
    });

    if (controller.refs.importInputRef.current) {
      controller.refs.importInputRef.current.value = '';
    }
  };
}

export function createImportAction(controller: GalleryImportController) {
  return async (strategy: MediaHubImportConflictStrategy, withBusy: GalleryBusyAction) => {
    const pendingImport = controller.state.storage.pendingImport;
    if (!pendingImport) {
      return;
    }

    const runId = `gallery-import-${Date.now()}-${++importRunSequence}`;
    controller.actions.surface.setPendingImport(null);
    controller.actions.surface.setActiveImport({
      file: pendingImport.file,
      id: runId,
      kind: 'backup',
      progress: { bytesRead: 0, bytesWritten: 0, currentFilename: null, rootsComplete: 0 },
      status: 'running',
      strategy,
      totalBytes: pendingImport.summary.totalBytes,
      totalRoots: pendingImport.summary.rootCount,
    });
    controller.refs.importTriggerRef.current?.focus();

    await withBusy(async () => {
      const abortController = new AbortController();
      let operationId = pendingImport.resumeOperationId ?? null;
      activeImportAbortControllers.set(runId, abortController);
      try {
        const onProgress = (progress: {
          bytesRead: number;
          bytesWritten: number;
          currentFilename: string | null;
          rootsComplete: number;
        }) => {
          controller.actions.surface.setActiveImport((current) =>
            current?.id === runId ? { ...current, progress } : current
          );
        };
        const result = pendingImport.resumeOperationId
          ? await resumeMediaHubBackupImport({
              file: pendingImport.file,
              operationId: pendingImport.resumeOperationId,
              onProgress,
              signal: abortController.signal,
            })
          : await importMediaHubBackup(pendingImport.file, strategy, {
              onSessionCreated: (createdOperationId) => {
                operationId = createdOperationId;
              },
              onProgress,
              signal: abortController.signal,
            });
        if (abortController.signal.aborted) {
          controller.actions.surface.setActiveImport((current) =>
            current?.id === runId ? { ...current, result, status: 'cancelled' } : current
          );
          return;
        }
        controller.actions.surface.setActiveImport((current) =>
          current?.id === runId ? { ...current, result, status: 'completed' } : current
        );
        await controller.actions.filters.reloadSavedViews();
        await controller.actions.storage.refresh();
      } catch {
        let partialResult:
          | {
              conflictsResolved: number;
              imported: number;
              operationId: string;
              skipped: number;
            }
          | undefined;
        if (operationId) {
          const session = await readMediaHubRestoreSummary(operationId).catch(() => null);
          if (session) {
            partialResult = {
              conflictsResolved: session.conflictedRootCount,
              imported: session.committedRootCount - session.skippedRootCount,
              operationId: session.operationId,
              skipped: session.skippedRootCount,
            };
          }
        }
        controller.actions.surface.setActiveImport((current) =>
          current?.id === runId
            ? {
                ...current,
                ...(partialResult ? { result: partialResult } : {}),
                status: abortController.signal.aborted ? 'cancelled' : 'failed',
              }
            : current
        );
      } finally {
        if (activeImportAbortControllers.get(runId) === abortController) {
          activeImportAbortControllers.delete(runId);
        }
      }
    });
  };
}

export function createClosePendingImportAction(controller: GalleryImportController) {
  return () => {
    controller.actions.surface.setPendingImport(null);
  };
}

export function createCancelActiveImportAction(controller: GalleryImportController) {
  return () => {
    const active = controller.state.storage.activeImport;
    if (!active || active.status !== 'running') return;
    controller.actions.surface.setActiveImport({ ...active, status: 'cancelling' });
    activeImportAbortControllers.get(active.id)?.abort();
  };
}

export function registerGalleryImportAbortController(
  runId: string,
  abortController: AbortController
): () => void {
  activeImportAbortControllers.set(runId, abortController);
  return () => {
    if (activeImportAbortControllers.get(runId) === abortController) {
      activeImportAbortControllers.delete(runId);
    }
  };
}

export function createDismissActiveImportAction(controller: GalleryImportController) {
  return () => {
    const active = controller.state.storage.activeImport;
    if (active?.status === 'running' || active?.status === 'cancelling') return;
    controller.actions.surface.setActiveImport(null);
  };
}
