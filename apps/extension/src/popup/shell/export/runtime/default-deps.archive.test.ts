// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MAX_SAVE_BLOB_BASE64_DECODED_BYTES } from '@sniptale/runtime-contracts/validation/base64';

const ARCHIVE_SESSION_ID = '00000000-0000-4000-8000-000000000001';
const STAGED_ARCHIVE_ID = '00000000-0000-4000-8000-000000000002';

const dependencyMocks = vi.hoisted(() => ({
  getActiveTabId: vi.fn(),
  loadSettings: vi.fn(),
  requestPopupExportPreview: vi.fn(),
  sendPopupExportTabMessage: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  sendTabMessage: vi.fn(),
}));

vi.mock('../../tab-access', () => ({
  getActiveTabId: dependencyMocks.getActiveTabId,
}));

vi.mock('./preview-request', async (importOriginal) => ({
  ...(await importOriginal()),
  requestPopupExportPreview: dependencyMocks.requestPopupExportPreview,
}));

vi.mock('./tab-message-routing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tab-message-routing')>()),
  sendPopupExportTabMessage: dependencyMocks.sendPopupExportTabMessage,
}));

vi.mock('../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal()),
  sendRuntimeMessage: dependencyMocks.sendRuntimeMessage,
  sendTabMessage: dependencyMocks.sendTabMessage,
}));

vi.mock('../../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/settings')>()),
  loadSettings: dependencyMocks.loadSettings,
}));

import { getDefaultPopupExportRuntimeDeps } from './default-deps';

function installFileReader(results: readonly string[], error: Error | null = null) {
  let index = 0;

  class TestFileReader {
    result = '';
    error = error;
    onerror: (() => void) | null = null;
    onload: (() => void) | null = null;

    readAsDataURL() {
      if (this.error) {
        this.onerror?.();
        return;
      }

      this.result = results[index] ?? results[results.length - 1] ?? '';
      index += 1;
      this.onload?.();
    }
  }

  vi.stubGlobal('FileReader', TestFileReader);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(crypto, 'randomUUID')
    .mockReturnValueOnce(ARCHIVE_SESSION_ID)
    .mockReturnValueOnce(STAGED_ARCHIVE_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('stages and saves batch archive blobs through popup export runtime messages', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: 'preset-7' });
  installFileReader(['data:application/zip;base64,ZmFrZQ==']);
  dependencyMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      complete: true,
      stagedArchiveId: STAGED_ARCHIVE_ID,
      success: true,
    })
    .mockResolvedValueOnce({ result: 'accepted', success: true });

  const deps = getDefaultPopupExportRuntimeDeps();

  await deps.saveArchiveBlob(new Blob(['fake'], { type: 'application/zip' }), 'export.zip');

  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(1, {
    archiveSessionId: ARCHIVE_SESSION_ID,
    base64: 'ZmFrZQ==',
    chunkIndex: 0,
    stagedArchiveId: STAGED_ARCHIVE_ID,
    totalBytes: 4,
    totalChunks: 1,
    type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  });
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    archiveSessionId: ARCHIVE_SESSION_ID,
    filename: 'export.zip',
    mimeType: 'application/zip',
    presetId: 'preset-7',
    stagedArchiveId: STAGED_ARCHIVE_ID,
    type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
  });
});

it('defaults archive MIME type and releases failed archive-save responses', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: null });
  installFileReader(['data:application/octet-stream;base64,ZmFrZQ==']);
  dependencyMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      complete: true,
      stagedArchiveId: STAGED_ARCHIVE_ID,
      success: true,
    })
    .mockResolvedValueOnce({ success: false, error: 'Save failed' });

  const deps = getDefaultPopupExportRuntimeDeps();

  await expect(deps.saveArchiveBlob(new Blob(['fake']), 'export.zip')).rejects.toThrow(
    'Save failed'
  );
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    archiveSessionId: ARCHIVE_SESSION_ID,
    filename: 'export.zip',
    mimeType: 'application/zip',
    presetId: undefined,
    stagedArchiveId: STAGED_ARCHIVE_ID,
    type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
  });
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(3, {
    archiveSessionId: ARCHIVE_SESSION_ID,
    stagedArchiveId: STAGED_ARCHIVE_ID,
    type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
  });
});

it('stops before final save when archive staging fails', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: null });
  installFileReader(['data:application/zip;base64,ZmFrZQ==']);
  dependencyMocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: false,
    error: 'Stage failed',
  });

  const deps = getDefaultPopupExportRuntimeDeps();

  await expect(
    deps.saveArchiveBlob(new Blob(['fake'], { type: 'application/zip' }), 'export.zip')
  ).rejects.toThrow('Stage failed');
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    archiveSessionId: ARCHIVE_SESSION_ID,
    stagedArchiveId: STAGED_ARCHIVE_ID,
    type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
  });
});

it('stops before runtime messages when the archive blob is empty', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: null });

  const deps = getDefaultPopupExportRuntimeDeps();

  await expect(deps.saveArchiveBlob(new Blob([]), 'export.zip')).rejects.toThrow(
    'Export archive is empty.'
  );
  expect(dependencyMocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('stops before runtime messages when the archive blob is too large', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: null });

  const deps = getDefaultPopupExportRuntimeDeps();
  const oversizedBlob = {
    size: MAX_SAVE_BLOB_BASE64_DECODED_BYTES + 1,
    type: 'application/zip',
  } as Blob;

  await expect(deps.saveArchiveBlob(oversizedBlob, 'export.zip')).rejects.toThrow(
    'Export archive is too large.'
  );
  expect(dependencyMocks.sendRuntimeMessage).not.toHaveBeenCalled();
});

it('rejects staging responses for the wrong archive session', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: null });
  installFileReader(['data:application/zip;base64,ZmFrZQ==']);
  dependencyMocks.sendRuntimeMessage.mockResolvedValueOnce({
    complete: true,
    stagedArchiveId: 'different-stage',
    success: true,
  });

  const deps = getDefaultPopupExportRuntimeDeps();

  await expect(deps.saveArchiveBlob(new Blob(['fake']), 'export.zip')).rejects.toThrow(
    'Failed to stage complete export archive.'
  );
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
  expect(dependencyMocks.sendRuntimeMessage).toHaveBeenNthCalledWith(2, {
    archiveSessionId: ARCHIVE_SESSION_ID,
    stagedArchiveId: STAGED_ARCHIVE_ID,
    type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
  });
});

it('rejects when FileReader fails while staging the archive blob', async () => {
  dependencyMocks.loadSettings.mockResolvedValue({ defaultExportPresetId: null });
  installFileReader([], new Error('reader failed'));

  const deps = getDefaultPopupExportRuntimeDeps();

  await expect(deps.saveArchiveBlob(new Blob(['fake']), 'export.zip')).rejects.toThrow(
    'reader failed'
  );
  expect(dependencyMocks.sendRuntimeMessage).not.toHaveBeenCalled();
});
