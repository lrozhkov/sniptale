import { beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const archiveRouteMocks = vi.hoisted(() => ({
  buildDownloadFilename: vi.fn(),
  createDownloadRouterService: vi.fn(),
  executeDownload: vi.fn(),
  executeDownloadBlob: vi.fn(),
  resolvePresetPath: vi.fn(),
}));

vi.mock('../download/download-router', () => ({
  buildDownloadFilename: archiveRouteMocks.buildDownloadFilename,
  createDownloadRouterService: archiveRouteMocks.createDownloadRouterService,
  executeDownload: archiveRouteMocks.executeDownload,
  executeDownloadBlob: archiveRouteMocks.executeDownloadBlob,
  resolvePresetPath: archiveRouteMocks.resolvePresetPath,
}));

async function importRoute() {
  vi.resetModules();
  return import('./archive-route');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  archiveRouteMocks.executeDownloadBlob.mockResolvedValue(undefined);
});

function createStageMessage(base64 = Buffer.from('zip').toString('base64')) {
  return {
    archiveSessionId: 'archive-session-1',
    base64,
    chunkIndex: 0,
    stagedArchiveId: 'staged-archive-1',
    totalBytes: Buffer.from(base64, 'base64').byteLength,
    totalChunks: 1,
    type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  };
}

function createSaveMessage() {
  return {
    archiveSessionId: 'archive-session-1',
    filename: 'export.zip',
    mimeType: 'application/zip',
    presetId: 'preset-1',
    stagedArchiveId: 'staged-archive-1',
    type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
  };
}

it('saves popup export archives through the download router without capture job state', async () => {
  const sendResponse = vi.fn();
  const { routePopupExportArchiveMessage } = await importRoute();

  expect(routePopupExportArchiveMessage(createStageMessage(), sendResponse)).toBe(true);
  expect(routePopupExportArchiveMessage(createSaveMessage(), sendResponse)).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' })
  );

  expect(archiveRouteMocks.executeDownloadBlob).toHaveBeenCalledWith(
    expect.any(Blob),
    'export.zip',
    'preset-1'
  );
});

it('rejects direct popup export archive payloads before downloading', async () => {
  const sendResponse = vi.fn();
  const { routePopupExportArchiveMessage } = await importRoute();

  expect(
    routePopupExportArchiveMessage(
      {
        base64: 'not base64',
        filename: '../export.zip',
        mimeType: 'text/html',
        type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
      },
      sendResponse
    )
  ).toBe(true);

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Invalid popup export archive payload',
    success: false,
  });
  expect(archiveRouteMocks.executeDownloadBlob).not.toHaveBeenCalled();
});

it('rejects duplicate chunks and invalidates the staged archive', async () => {
  const sendResponse = vi.fn();
  const { routePopupExportArchiveMessage } = await importRoute();
  const stageMessage = createStageMessage();

  expect(routePopupExportArchiveMessage(stageMessage, sendResponse)).toBe(true);
  expect(routePopupExportArchiveMessage(stageMessage, sendResponse)).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Popup export staged archive chunk was already received',
    success: false,
  });

  expect(routePopupExportArchiveMessage(createSaveMessage(), sendResponse)).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Popup export staged archive is missing or incomplete',
      success: false,
    })
  );
});

it('rejects invalid staged archive chunk metadata before saving', async () => {
  const sendResponse = vi.fn();
  const { routePopupExportArchiveMessage } = await importRoute();

  expect(
    routePopupExportArchiveMessage(
      {
        ...createStageMessage(),
        archiveSessionId: '../archive-session',
      },
      sendResponse
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Popup export staged archive metadata is invalid',
    success: false,
  });

  expect(routePopupExportArchiveMessage(createSaveMessage(), sendResponse)).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Popup export staged archive is missing or incomplete',
      success: false,
    })
  );
  expect(archiveRouteMocks.executeDownloadBlob).not.toHaveBeenCalled();
});

it('releases partial staged archives on request', async () => {
  const sendResponse = vi.fn();
  const { routePopupExportArchiveMessage } = await importRoute();

  expect(
    routePopupExportArchiveMessage(
      {
        ...createStageMessage(),
        totalBytes: 6,
        totalChunks: 2,
      },
      sendResponse
    )
  ).toBe(true);
  expect(
    routePopupExportArchiveMessage(
      {
        archiveSessionId: 'archive-session-1',
        stagedArchiveId: 'staged-archive-1',
        type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
      },
      sendResponse
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'released' });

  expect(routePopupExportArchiveMessage(createSaveMessage(), sendResponse)).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Popup export staged archive is missing or incomplete',
      success: false,
    })
  );
  expect(archiveRouteMocks.executeDownloadBlob).not.toHaveBeenCalled();
});

it('does not retain staged archives after final download failure', async () => {
  const sendResponse = vi.fn();
  archiveRouteMocks.executeDownloadBlob.mockRejectedValueOnce(new Error('download failed'));
  const { routePopupExportArchiveMessage } = await importRoute();

  expect(routePopupExportArchiveMessage(createStageMessage(), sendResponse)).toBe(true);
  expect(routePopupExportArchiveMessage(createSaveMessage(), sendResponse)).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'download failed',
      success: false,
    })
  );

  expect(routePopupExportArchiveMessage(createSaveMessage(), sendResponse)).toBe(true);
  await vi.waitFor(() =>
    expect(sendResponse).toHaveBeenCalledWith({
      error: 'Popup export staged archive is missing or incomplete',
      success: false,
    })
  );
});

it('limits active staged archive sessions', async () => {
  const sendResponse = vi.fn();
  const { routePopupExportArchiveMessage } = await importRoute();

  for (let index = 1; index <= 4; index += 1) {
    expect(
      routePopupExportArchiveMessage(
        {
          ...createStageMessage(),
          archiveSessionId: `archive-session-${index}`,
          chunkIndex: 0,
          stagedArchiveId: `staged-archive-${index}`,
          totalBytes: 4,
          totalChunks: 2,
        },
        sendResponse
      )
    ).toBe(true);
  }

  expect(
    routePopupExportArchiveMessage(
      {
        ...createStageMessage(),
        archiveSessionId: 'archive-session-5',
        stagedArchiveId: 'staged-archive-5',
        totalBytes: 4,
        totalChunks: 2,
      },
      sendResponse
    )
  ).toBe(true);
  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Too many popup export staged archives',
    success: false,
  });
  expect(archiveRouteMocks.executeDownloadBlob).not.toHaveBeenCalled();
});

it('returns false for unrelated runtime messages', async () => {
  const { routePopupExportArchiveMessage } = await importRoute();

  expect(routePopupExportArchiveMessage({ type: MessageType.EXECUTE_SAVE }, vi.fn())).toBe(false);
});
