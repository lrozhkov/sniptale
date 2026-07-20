import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  chunks: new Map<string, NativeTransferChunkEntry>(),
  completeFails: false,
  deleteFails: false,
  editorFails: false,
  getNativeTransferSessionMock: vi.fn(),
  screenshotSaveFails: false,
  screenshotSaveMock: vi.fn(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
  tabsCreateMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: mocks.tabsCreateMock },
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: () => 'editor-session-1',
}));

vi.mock('../../../platform/navigation/extension-pages/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages/editor')>()),
  buildEditorUrl: ({ assetId }: { assetId?: string }) => `chrome://editor/?assetId=${assetId}`,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveScreenshotMediaAssetSafely: mocks.screenshotSaveMock,
}));

vi.mock('./persistence/staging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./persistence/staging')>()),
  completeNativeTransferSession: vi.fn(async (entry: NativeTransferSessionEntry) => {
    if (mocks.completeFails) {
      throw new Error('complete failed');
    }
    mocks.sessions.set(entry.id, entry);
    for (const key of [...mocks.chunks.keys()]) {
      if (key.startsWith(`${entry.id}:`)) {
        mocks.chunks.delete(key);
      }
    }
  }),
  createNativeTransferExpiry: (now = Date.now()) => now + 86_400_000,
  deleteNativeTransferSession: vi.fn(async (id: string) => {
    if (mocks.deleteFails) {
      throw new Error('delete failed');
    }
    mocks.sessions.delete(id);
    for (const key of [...mocks.chunks.keys()]) {
      if (key.startsWith(`${id}:`)) {
        mocks.chunks.delete(key);
      }
    }
  }),
  getNativeTransferSession: mocks.getNativeTransferSessionMock,
  listNativeTransferChunks: vi.fn(async (sessionId: string) =>
    [...mocks.chunks.values()].filter((entry) => entry.sessionId === sessionId)
  ),
  putNativeTransferChunkAndSession: vi.fn(
    async ({
      chunk,
      session,
    }: {
      chunk: NativeTransferChunkEntry;
      session: NativeTransferSessionEntry;
    }) => {
      mocks.chunks.set(`${chunk.sessionId}:${chunk.chunkIndex}`, chunk);
      mocks.sessions.set(session.id, session);
    }
  ),
  putNativeTransferSession: vi.fn(async (entry: NativeTransferSessionEntry) => {
    mocks.sessions.set(entry.id, entry);
  }),
}));

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function createScreenshotStart(bytes: Uint8Array): Promise<AppScreenshotStartMessage> {
  return {
    capturedAtEpochMs: 10,
    captureId: 'capture-1',
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    filename: 'capture.png',
    height: 20,
    mimeType: 'image/png',
    mode: 'screen',
    openEditor: true,
    protocolVersion: 1,
    sha256: await sha256Hex(bytes),
    totalBytes: bytes.byteLength,
    type: 'app.screenshot.start',
    width: 30,
  };
}

async function createScreenshotChunk(bytes: Uint8Array): Promise<AppScreenshotChunkMessage> {
  return {
    base64: toBase64(bytes),
    captureId: 'capture-1',
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: bytes.byteLength,
    chunkSha256: await sha256Hex(bytes),
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    type: 'app.screenshot.chunk',
  };
}

function createScreenshotCommit(): AppScreenshotCommitMessage {
  return {
    captureId: 'capture-1',
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    type: 'app.screenshot.commit',
  };
}

async function stageScreenshot(bytes: Uint8Array) {
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleScreenshotStart(await createScreenshotStart(bytes));
  await controller.handleScreenshotChunk(await createScreenshotChunk(bytes));
  return controller;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunks.clear();
  mocks.sessions.clear();
  mocks.completeFails = false;
  mocks.deleteFails = false;
  mocks.editorFails = false;
  mocks.getNativeTransferSessionMock.mockImplementation(async (id: string) =>
    mocks.sessions.get(id)
  );
  mocks.screenshotSaveFails = false;
  mocks.screenshotSaveMock.mockImplementation(async (input: { id?: string }) => {
    if (mocks.screenshotSaveFails) {
      throw new Error('screenshot save failed');
    }
    return { id: input.id ?? 'asset-1' };
  });
  mocks.tabsCreateMock.mockImplementation(async () => {
    if (mocks.editorFails) {
      throw new Error('tab failed');
    }
  });
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 10_000, usage: 0 }) },
  });
});

it('rejects screenshot commits when media save fails and keeps staged data retryable', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const controller = await stageScreenshot(bytes);
  mocks.screenshotSaveFails = true;

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(true);
});

it('acks screenshot commits after media save when optional editor opening fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const controller = await stageScreenshot(bytes);
  mocks.editorFails = true;

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ assetId: 'capture-1', type: 'extension.screenshot.ack' }),
  ]);
  expect(mocks.screenshotSaveMock).toHaveBeenCalled();
  expect(mocks.screenshotSaveMock).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'capture-1' })
  );
  expect(mocks.tabsCreateMock).toHaveBeenCalled();
});

it('rejects replayed screenshot starts after a successful commit without saving again', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const controller = await stageScreenshot(bytes);

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ assetId: 'capture-1', type: 'extension.screenshot.ack' }),
  ]);
  await expect(
    controller.handleScreenshotStart(await createScreenshotStart(bytes))
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'duplicate-or-replay',
      type: 'extension.screenshot.reject',
    }),
  ]);
  expect(mocks.screenshotSaveMock).toHaveBeenCalledTimes(1);
});

it('rejects screenshot commits when the completed replay marker cannot be written', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const controller = await stageScreenshot(bytes);
  mocks.completeFails = true;

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.get('capture-1')).toEqual(expect.objectContaining({ kind: 'screenshot' }));
});

it('uses the stable capture id when retrying after completed marker writes fail', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const controller = await stageScreenshot(bytes);
  mocks.completeFails = true;

  await controller.handleScreenshotCommit(createScreenshotCommit());
  await controller.handleScreenshotCommit(createScreenshotCommit());

  expect(mocks.screenshotSaveMock).toHaveBeenCalledTimes(2);
  expect(mocks.screenshotSaveMock).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ id: 'capture-1' })
  );
  expect(mocks.screenshotSaveMock).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ id: 'capture-1' })
  );
});

it('rejects and clears screenshot transfers when the initial commit session read fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const controller = await stageScreenshot(bytes);
  mocks.getNativeTransferSessionMock.mockRejectedValueOnce(new Error('storage failed'));

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
  expect([...mocks.chunks.keys()].some((key) => key.startsWith('capture-1:'))).toBe(false);
});
