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
  createClosePendingExportAction,
  createClosePendingImportAction,
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
  resumeMediaHubBackupImportMock,
} = vi.hoisted(() => ({
  exportMediaHubBackupMock: vi.fn(),
  importMediaHubBackupMock: vi.fn(),
  inspectLocalMediaHubBackupMock: vi.fn(),
  inspectMediaHubBackupMock: vi.fn(),
  listResumableMediaHubRestoresMock: vi.fn(),
  resumeMediaHubBackupImportMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub-backup/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub-backup/index')>()),
  exportMediaHubBackup: exportMediaHubBackupMock,
  importMediaHubBackup: importMediaHubBackupMock,
  inspectLocalMediaHubBackup: inspectLocalMediaHubBackupMock,
  inspectMediaHubBackup: inspectMediaHubBackupMock,
  listResumableMediaHubRestores: listResumableMediaHubRestoresMock,
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
    thumbnailCount: 0,
  };
}

function createLocalBackupSummary(): MediaHubLocalBackupSummary {
  return {
    approximateSizeBytes: 4096,
    assetCount: 2,
    dataClasses: {
      mediaAssets: true,
      recordings: true,
      scenarioProjects: true,
      sourceMetadata: true,
      telemetry: true,
      thumbnails: true,
      videoProjects: true,
      webSnapshots: true,
    },
    recordingCount: 1,
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
      scope: 'selected',
      selected: {
        mediaAssetIds: ['asset-1'],
        scenarioProjectIds: ['scenario-1'],
        videoProjectIds: ['video-project-1'],
      },
    })
  );
}

async function verifyBackupImportFlow() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });

  inspectMediaHubBackupMock.mockResolvedValue(summary);
  importMediaHubBackupMock.mockResolvedValue({
    importedAssets: 2,
    skippedConflicts: ['asset-1'],
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
    importedAssets: 1,
    skippedConflicts: [],
  });

  await createImportSelectedFileAction(controller)(importFile, runBusyAction);

  expect(getState().storage.pendingImport).toMatchObject({
    resumeOperationId: 'restore-1',
    resumeStrategy: 'duplicate',
  });

  await createImportAction(controller)('replace', runBusyAction);

  expect(resumeMediaHubBackupImportMock).toHaveBeenCalledWith({
    file: importFile,
    operationId: 'restore-1',
    signal: expect.any(AbortSignal),
  });
  expect(importMediaHubBackupMock).not.toHaveBeenCalled();
  expect(getState().storage.pendingImport).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
}

async function verifyCancelledBackupImportFlow() {
  const summary = createBackupSummary();
  const { controller, getState } = createController();
  const importFile = new File(['zip'], 'backup.zip', { type: 'application/zip' });
  let importSignal = new AbortController().signal;
  let resolveImport: (result: {
    importedAssets: number;
    skippedConflicts: string[];
  }) => void = () => undefined;

  inspectMediaHubBackupMock.mockResolvedValue(summary);
  importMediaHubBackupMock.mockImplementation((_file, _strategy, options) => {
    importSignal = options?.signal ?? importSignal;
    return new Promise((resolve) => {
      resolveImport = resolve;
    });
  });

  await createImportSelectedFileAction(controller)(importFile, runBusyAction);
  const importPromise = createImportAction(controller)('replace', runBusyAction);
  await Promise.resolve();
  await Promise.resolve();

  createClosePendingImportAction(controller)();
  resolveImport({ importedAssets: 1, skippedConflicts: [] });
  await importPromise;

  expect(importSignal.aborted).toBe(true);
  expect(getState().storage.pendingImport).toBeNull();
  expect(controller.actions.storage.refresh).not.toHaveBeenCalled();
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
  it('opens backup disclosure with the selected item scope', verifySelectedExportScope);
  it('imports selected backup files through the existing conflict flow', verifyBackupImportFlow);
  it('resumes a matching durable restore with its fixed strategy', verifyResumableBackupImportFlow);
  it('aborts an in-progress restore when the import modal closes', verifyCancelledBackupImportFlow);
});
