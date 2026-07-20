// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
} = vi.hoisted(() => ({
  exportMediaHubBackupMock: vi.fn(),
  importMediaHubBackupMock: vi.fn(),
  inspectLocalMediaHubBackupMock: vi.fn(),
  inspectMediaHubBackupMock: vi.fn(),
}));

vi.mock('../../../workflows/media-hub-backup/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub-backup/index')>()),
  exportMediaHubBackup: exportMediaHubBackupMock,
  importMediaHubBackup: importMediaHubBackupMock,
  inspectLocalMediaHubBackup: inspectLocalMediaHubBackupMock,
  inspectMediaHubBackup: inspectMediaHubBackupMock,
}));

let anchorClickSpy = vi.fn();
let originalCreateElement: typeof document.createElement;

function createBackupSummary(): MediaHubBackupSummary {
  return {
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
      editorDrafts: true,
      mediaAssets: true,
      recordings: true,
      scenarioProjects: true,
      sourceMetadata: true,
      telemetry: true,
      thumbnails: true,
      videoProjects: true,
      webSnapshots: true,
    },
    editorDraftCount: 1,
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
    includeEditorDrafts: true,
    includeSourceMetadata: false,
    includeTelemetry: true,
    includeWebSnapshots: true,
    scope: 'all' as const,
  };
}

function stubAnchorDownloads() {
  originalCreateElement = document.createElement.bind(document);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    if (tagName !== 'a') {
      return originalCreateElement(tagName);
    }

    const anchor = originalCreateElement('a');
    anchor.click = () => {
      anchorClickSpy();
    };
    return anchor;
  });
}

beforeEach(() => {
  exportMediaHubBackupMock.mockReset();
  importMediaHubBackupMock.mockReset();
  inspectLocalMediaHubBackupMock.mockReset();
  inspectMediaHubBackupMock.mockReset();
  anchorClickSpy = vi.fn();
  stubAnchorDownloads();
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function verifyExportRequiresDisclosure() {
  const localSummary = createLocalBackupSummary();
  const backupBlob = new Blob(['backup'], { type: 'application/zip' });
  const { controller, getState } = createController();

  inspectLocalMediaHubBackupMock.mockResolvedValue(localSummary);
  exportMediaHubBackupMock.mockResolvedValue(backupBlob);

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
  expect(anchorClickSpy).toHaveBeenCalledTimes(1);
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
  expect(anchorClickSpy).not.toHaveBeenCalled();
  expect(getState().storage.pendingExport).toEqual({
    options: pendingOptions,
    summary: createLocalBackupSummary(),
  });
}

async function verifyCancelledExportAbortsAndSkipsDownload() {
  const { controller, getState } = createController();
  const pendingOptions = createAllBackupOptions();
  let exportSignal = new AbortController().signal;
  let rejectExport: (error: Error) => void = () => undefined;

  inspectLocalMediaHubBackupMock.mockResolvedValue(createLocalBackupSummary());
  exportMediaHubBackupMock.mockImplementation((_options, runtimeOptions) => {
    exportSignal = runtimeOptions?.signal ?? exportSignal;
    return new Promise<Blob>((_resolve, reject) => {
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
  expect(anchorClickSpy).not.toHaveBeenCalled();
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

  expect(importMediaHubBackupMock).toHaveBeenCalledWith(importFile, 'replace');
  expect(getState().storage.pendingImport).toBeNull();
  expect(controller.actions.storage.refresh).toHaveBeenCalledTimes(1);
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
    'aborts in-progress backup export when the pending export modal closes',
    verifyCancelledExportAbortsAndSkipsDownload
  );
  it('opens backup disclosure with the selected item scope', verifySelectedExportScope);
  it('imports selected backup files through the existing conflict flow', verifyBackupImportFlow);
});
