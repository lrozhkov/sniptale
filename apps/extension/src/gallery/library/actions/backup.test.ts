// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  MediaHubBackupSummary,
  MediaHubImportConflictStrategy,
  MediaHubLocalBackupSummary,
} from '../../../workflows/media-hub-backup/index';
import {
  createController,
  createMediaItem,
  createScenarioItem,
  createVideoProjectItem,
  runBusyAction,
} from './test-support/index';
import {
  createCancelActiveImportAction,
  createClosePendingExportAction,
  createConfirmExportBackupAction,
  createExportBackupAction,
  createImportAction,
  createImportSelectedFileAction,
} from './backup';

const {
  exportMediaHubBackupMock,
  importMediaHubBackupMock,
  inspectLocalMediaHubBackupMock,
  inspectMediaHubBackupMock,
  listResumableMediaHubRestoresMock,
  readMediaHubRestoreSummaryMock,
  resumeMediaHubBackupImportMock,
} = vi.hoisted(() => ({
  exportMediaHubBackupMock: vi.fn(),
  importMediaHubBackupMock: vi.fn(),
  inspectLocalMediaHubBackupMock: vi.fn(),
  inspectMediaHubBackupMock: vi.fn(),
  listResumableMediaHubRestoresMock: vi.fn(),
  readMediaHubRestoreSummaryMock: vi.fn(),
  resumeMediaHubBackupImportMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub-backup/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub-backup/index')>()),
  exportMediaHubBackup: exportMediaHubBackupMock,
  importMediaHubBackup: importMediaHubBackupMock,
  inspectLocalMediaHubBackup: inspectLocalMediaHubBackupMock,
  inspectMediaHubBackup: inspectMediaHubBackupMock,
  listResumableMediaHubRestores: listResumableMediaHubRestoresMock,
  readMediaHubRestoreSummary: readMediaHubRestoreSummaryMock,
  resumeMediaHubBackupImport: resumeMediaHubBackupImportMock,
}));

function createBackupSummary(): MediaHubBackupSummary {
  return {
    archiveFingerprint: 'a'.repeat(64),
    assetCount: 2,
    conflicts: ['asset-1'],
    manifest: {
      assetCount: 2,
      effectBundleCount: 0,
      exportedAt: '2026-03-20T00:00:00.000Z',
      format: 'sniptale-media-hub-backup',
      thumbnailCount: 0,
      version: 1,
    },
    rootCount: 2,
    thumbnailCount: 0,
    totalBytes: 4096,
  };
}

function createLocalBackupSummary(): MediaHubLocalBackupSummary {
  return {
    approximateSizeBytes: 4096,
    assetCount: 2,
    draftCount: 0,
    dataClasses: {
      drafts: false,
      mediaAssets: true,
      recordings: true,
      savedViews: true,
      scenarioProjects: true,
      sourceMetadata: true,
      telemetry: true,
      thumbnails: true,
      videoProjects: true,
      webSnapshots: true,
    },
    recordingCount: 1,
    savedViewCount: 2,
    scenarioProjectCount: 0,
    selectedCount: 0,
    sourceMetadataCount: 2,
    thumbnailCount: 1,
    videoProjectCount: 0,
    webSnapshotCount: 1,
  };
}

function createAllBackupOptions() {
  return {
    includeDrafts: false,
    includeSourceMetadata: false,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all' as const,
  };
}

beforeEach(() => {
  exportMediaHubBackupMock.mockReset();
  importMediaHubBackupMock.mockReset();
  inspectLocalMediaHubBackupMock.mockReset();
  inspectMediaHubBackupMock.mockReset();
  listResumableMediaHubRestoresMock.mockReset();
  listResumableMediaHubRestoresMock.mockResolvedValue([]);
  readMediaHubRestoreSummaryMock.mockReset();
  readMediaHubRestoreSummaryMock.mockResolvedValue(null);
  resumeMediaHubBackupImportMock.mockReset();
});

async function verifyExportRequiresDisclosure() {
  const localSummary = createLocalBackupSummary();
  const { controller, getState } = createController();

  inspectLocalMediaHubBackupMock.mockResolvedValue(localSummary);
  exportMediaHubBackupMock.mockResolvedValue(undefined);

  await createExportBackupAction(controller, runBusyAction)();

  expect(inspectLocalMediaHubBackupMock).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'all' })
  );
  expect(getState().storage.pendingExport).toEqual({
    options: expect.objectContaining({ scope: 'all' }),
    summary: localSummary,
  });
  expect(exportMediaHubBackupMock).not.toHaveBeenCalled();

  await createConfirmExportBackupAction(controller)(
    getState().storage.pendingExport!.options,
    runBusyAction
  );

  expect(inspectLocalMediaHubBackupMock).toHaveBeenCalledTimes(2);
  expect(exportMediaHubBackupMock).toHaveBeenCalledWith(
    expect.objectContaining({ scope: 'all' }),
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(getState().storage.pendingExport).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyConfirmExportRequiresFreshDisclosureInspection() {
  const { controller, getState } = createController();
  const pendingOptions = createAllBackupOptions();

  controller.actions.surface.setPendingExport({
    options: pendingOptions,
    summary: createLocalBackupSummary(),
  });
  inspectLocalMediaHubBackupMock.mockRejectedValue(new Error('inspection failed'));

  await expect(
    createConfirmExportBackupAction(controller)(pendingOptions, runBusyAction)
  ).rejects.toThrow('inspection failed');

  expect(exportMediaHubBackupMock).not.toHaveBeenCalled();
  expect(getState().storage.pendingExport).toEqual({
    options: pendingOptions,
    summary: createLocalBackupSummary(),
  });
}

async function verifyDirectSinkFailureIsAuthoritative() {
  const { controller } = createController();
  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());
  exportMediaHubBackupMock.mockRejectedValue(new Error('external disk write failed'));

  await expect(
    createConfirmExportBackupAction(controller)(createAllBackupOptions(), runBusyAction)
  ).rejects.toThrow('external disk write failed');
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
}

async function verifyCancelledExportAbortsAndSkipsDownload() {
  const { controller, getState } = createController();
  const pendingOptions = createAllBackupOptions();
  let exportSignal = new AbortController().signal;
  let rejectExport: (error: Error) => void = () => undefined;

  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());
  exportMediaHubBackupMock.mockImplementation((_options, runtimeOptions) => {
    exportSignal = runtimeOptions?.signal ?? exportSignal;
    return new Promise<void>((_resolve, reject) => {
      rejectExport = reject;
    });
  });

  const exportPromise = createConfirmExportBackupAction(controller)(pendingOptions, runBusyAction);
  await Promise.resolve();
  await Promise.resolve();

  createClosePendingExportAction(controller)();
  rejectExport(new Error('cancelled'));
  await expect(exportPromise).rejects.toThrow('cancelled');

  expect(exportSignal.aborted).toBe(true);
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
  expect(getState().storage.pendingExport).toBeNull();
}

async function verifyResolvedCancelledExportSkipsRefresh() {
  const { controller, getState } = createController();
  const pendingOptions = createAllBackupOptions();
  let resolveExport: () => void = () => undefined;

  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());
  exportMediaHubBackupMock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveExport = resolve;
      })
  );

  const exportPromise = createConfirmExportBackupAction(controller)(pendingOptions, runBusyAction);
  await Promise.resolve();
  await Promise.resolve();
  createClosePendingExportAction(controller)();
  resolveExport();
  await exportPromise;

  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
  expect(getState().storage.pendingExport).toBeNull();
}

async function verifyRerenderedControllerCancelsCurrentExport() {
  const { controller } = createController();
  const pendingOptions = createAllBackupOptions();
  let exportSignal = new AbortController().signal;
  let rejectExport: (error: Error) => void = () => undefined;

  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());
  exportMediaHubBackupMock.mockImplementation((_options, runtimeOptions) => {
    exportSignal = runtimeOptions?.signal ?? exportSignal;
    return new Promise<void>((_resolve, reject) => {
      rejectExport = reject;
    });
  });

  const exportPromise = createConfirmExportBackupAction(controller)(pendingOptions, runBusyAction);
  await Promise.resolve();
  await Promise.resolve();
  const rerenderedController = { ...controller };
  createClosePendingExportAction(rerenderedController)();
  rejectExport(new Error('cancelled'));
  await expect(exportPromise).rejects.toThrow('cancelled');

  expect(exportSignal.aborted).toBe(true);
}

async function verifySelectedExportScope() {
  const { controller } = createController({
    selectedItems: [
      createMediaItem({ id: 'asset-1', entityId: 'asset-1' }),
      createScenarioItem({ entityId: 'scenario-1' }),
      createVideoProjectItem({ entityId: 'video-project-1' }),
    ],
  });

  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());

  await createExportBackupAction(controller, runBusyAction)();

  expect(inspectLocalMediaHubBackupMock).toHaveBeenCalledWith(
    expect.objectContaining({
      includeDrafts: false,
      scope: 'selected',
      selected: {
        mediaAssetIds: ['asset-1'],
        scenarioProjectIds: ['scenario-1'],
        videoProjectIds: ['video-project-1'],
      },
    })
  );
}

async function verifySelectedDraftEnablesDraftExport() {
  const { controller } = createController({
    selectedItems: [
      createMediaItem({
        id: 'draft-1',
        entityId: 'draft-1',
        lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 1 },
      }),
    ],
  });
  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());
  await createExportBackupAction(controller, runBusyAction)();
  expect(inspectLocalMediaHubBackupMock).toHaveBeenCalledWith(
    expect.objectContaining({ includeDrafts: true, scope: 'selected' })
  );
}

async function verifyImportModalTransitionsToProgressBeforeCompletion() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });
  let report:
    | ((progress: {
        bytesRead: number;
        bytesWritten: number;
        currentFilename: string | null;
        rootsComplete: number;
      }) => void)
    | undefined;
  let resolveImport: (result: {
    conflictsResolved: number;
    imported: number;
    operationId: string;
    skipped: number;
  }) => void = () => undefined;
  const focusTrigger = vi.spyOn(controller.refs.importTriggerRef.current!, 'focus');
  inspectMediaHubBackupMock.mockResolvedValue(summary);
  importMediaHubBackupMock.mockImplementation((_file, _strategy, options) => {
    report = options?.onProgress;
    return new Promise((resolve) => {
      resolveImport = resolve;
    });
  });
  await createImportSelectedFileAction(controller)(importFile, runBusyAction);
  const promise = createImportAction(controller)('replace', runBusyAction);
  await Promise.resolve();
  expect(getState().storage.pendingImport).toBeNull();
  expect(getState().storage.activeImport).toMatchObject({ status: 'running', totalRoots: 2 });
  expect(focusTrigger).toHaveBeenCalledOnce();
  report?.({
    bytesRead: 2048,
    bytesWritten: 2048,
    currentFilename: 'Screenshots/a.png',
    rootsComplete: 1,
  });
  expect(getState().storage.activeImport?.progress).toMatchObject({
    bytesRead: 2048,
    rootsComplete: 1,
  });
  resolveImport({ conflictsResolved: 0, imported: 2, operationId: 'operation-1', skipped: 0 });
  await promise;
  expect(getState().storage.activeImport).toMatchObject({ status: 'completed' });
}

async function verifyActiveImportBlocksAnotherTransfer() {
  const { controller } = createController({
    activeImport: {
      file: new File(['zip'], 'active.zip'),
      id: 'active-import',
      progress: {
        bytesRead: 0,
        bytesWritten: 0,
        currentFilename: null,
        rootsComplete: 0,
      },
      status: 'running',
      strategy: 'replace',
      totalBytes: 1,
      totalRoots: 1,
    },
  });
  await createImportSelectedFileAction(controller)(new File(['zip'], 'second.zip'), runBusyAction);
  await createExportBackupAction(controller, runBusyAction)();
  expect(inspectMediaHubBackupMock).not.toHaveBeenCalled();
  expect(inspectLocalMediaHubBackupMock).not.toHaveBeenCalled();
}

async function verifyBackupImportFlow() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });

  inspectMediaHubBackupMock.mockResolvedValue(summary);
  importMediaHubBackupMock.mockResolvedValue({
    conflictsResolved: 1,
    imported: 2,
    operationId: 'operation-1',
    skipped: 0,
  });

  controller.refs.importInputRef.current!.value = 'backup.zip';
  await createImportSelectedFileAction(controller)(importFile, runBusyAction);

  expect(inspectMediaHubBackupMock).toHaveBeenCalledWith(importFile);
  expect(getState().storage.pendingImport).toMatchObject({ file: importFile, summary });
  expect(controller.refs.importInputRef.current?.value).toBe('');

  await createImportAction(controller)(
    'replace' satisfies MediaHubImportConflictStrategy,
    runBusyAction
  );

  expect(importMediaHubBackupMock).toHaveBeenCalledWith(
    importFile,
    'replace',
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
  expect(getState().storage.pendingImport).toBeNull();
  expect(controller.actions.filters.reloadSavedViews).toHaveBeenCalledTimes(1);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyResumableBackupImportFlow() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });

  inspectMediaHubBackupMock.mockResolvedValue(summary);
  listResumableMediaHubRestoresMock.mockResolvedValue([
    {
      archiveFingerprint: summary.archiveFingerprint,
      operationId: 'restore-1',
      strategy: 'duplicate',
    },
  ]);
  resumeMediaHubBackupImportMock.mockResolvedValue({
    conflictsResolved: 0,
    imported: 1,
    operationId: 'restore-1',
    skipped: 0,
  });

  await createImportSelectedFileAction(controller)(importFile, runBusyAction);

  expect(getState().storage.pendingImport).toMatchObject({
    resumeOperationId: 'restore-1',
    resumeStrategy: 'duplicate',
  });

  await createImportAction(controller)('replace', runBusyAction);

  expect(resumeMediaHubBackupImportMock).toHaveBeenCalledWith({
    file: importFile,
    onProgress: expect.any(Function),
    operationId: 'restore-1',
    signal: expect.any(AbortSignal),
  });
  expect(importMediaHubBackupMock).not.toHaveBeenCalled();
  expect(getState().storage.pendingImport).toBeNull();
  expect(controller.actions.filters.reloadSavedViews).toHaveBeenCalledTimes(1);
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyCancelledBackupImportFlow() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });
  let importSignal = new AbortController().signal;
  let rejectImport: (error: Error) => void = () => undefined;

  inspectMediaHubBackupMock.mockResolvedValue(summary);
  importMediaHubBackupMock.mockImplementation((_file, _strategy, options) => {
    importSignal = options?.signal ?? importSignal;
    options?.onSessionCreated?.('restore-cancelled');
    return new Promise((_resolve, reject) => {
      rejectImport = reject;
    });
  });

  await createImportSelectedFileAction(controller)(importFile, runBusyAction);
  const importPromise = createImportAction(controller)('replace', runBusyAction);
  await Promise.resolve();
  await Promise.resolve();

  const rerenderedController = { ...controller };
  createCancelActiveImportAction(rerenderedController)();
  readMediaHubRestoreSummaryMock.mockResolvedValue({
    archiveFingerprint: summary.archiveFingerprint,
    committedRootCount: 1,
    conflictedRootCount: 1,
    currentRoot: null,
    operationId: 'restore-cancelled',
    skippedRootCount: 0,
    status: 'pending',
    strategy: 'replace',
  });
  rejectImport(new DOMException('cancelled', 'AbortError'));
  await importPromise;

  expect(importSignal.aborted).toBe(true);
  expect(getState().storage.pendingImport).toBeNull();
  expect(getState().storage.activeImport).toMatchObject({
    result: {
      conflictsResolved: 1,
      imported: 1,
      operationId: 'restore-cancelled',
      skipped: 0,
    },
    status: 'cancelled',
  });
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
}

async function verifyFailedBackupImportReportsPartialResult() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });

  inspectMediaHubBackupMock.mockResolvedValue(summary);
  importMediaHubBackupMock.mockImplementation((_file, _strategy, options) => {
    options?.onSessionCreated?.('restore-failed');
    return Promise.reject(new Error('disk write failed'));
  });
  readMediaHubRestoreSummaryMock.mockResolvedValue({
    archiveFingerprint: summary.archiveFingerprint,
    committedRootCount: 3,
    conflictedRootCount: 2,
    currentRoot: null,
    operationId: 'restore-failed',
    skippedRootCount: 1,
    status: 'aborted',
    strategy: 'replace',
  });

  await createImportSelectedFileAction(controller)(importFile, runBusyAction);
  await createImportAction(controller)('replace', runBusyAction);

  expect(getState().storage.activeImport).toMatchObject({
    result: {
      conflictsResolved: 2,
      imported: 2,
      operationId: 'restore-failed',
      skipped: 1,
    },
    status: 'failed',
  });
}

describe('gallery backup actions', () => {
  it(
    'requires disclosure before creating and downloading a backup archive',
    verifyExportRequiresDisclosure
  );
  it(
    'does not export when the confirm-time disclosure inspection fails',
    verifyConfirmExportRequiresFreshDisclosureInspection
  );
  it(
    'surfaces direct sink failures as authoritative export failures',
    verifyDirectSinkFailureIsAuthoritative
  );
  it(
    'aborts in-progress backup export when the pending export modal closes',
    verifyCancelledExportAbortsAndSkipsDownload
  );
  it(
    'skips refresh when cancellation wins after direct export completion',
    verifyResolvedCancelledExportSkipsRefresh
  );
  it(
    'cancels the current export after the render controller DTO is recreated',
    verifyRerenderedControllerCancelsCurrentExport
  );
  it('opens backup disclosure with the selected item scope', verifySelectedExportScope);
  it(
    'enables draft export for an explicitly selected draft',
    verifySelectedDraftEnablesDraftExport
  );
  it(
    'closes strategy state before restore completion and reports progress separately',
    verifyImportModalTransitionsToProgressBeforeCompletion
  );
  it(
    'blocks another import or export while restore is active',
    verifyActiveImportBlocksAnotherTransfer
  );
  it('imports selected backup files through the existing conflict flow', verifyBackupImportFlow);
  it('resumes a matching durable restore with its fixed strategy', verifyResumableBackupImportFlow);
  it('aborts an in-progress restore through the progress owner', verifyCancelledBackupImportFlow);
  it(
    'reports exact committed counts when a later restore root fails',
    verifyFailedBackupImportReportsPartialResult
  );
});
