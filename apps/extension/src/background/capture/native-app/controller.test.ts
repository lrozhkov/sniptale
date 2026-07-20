import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  browserTabsCreateMock: vi.fn(),
  chunks: new Map<string, NativeTransferChunkEntry>(),
  screenshotSaveMock: vi.fn(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: mocks.browserTabsCreateMock },
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
    mocks.sessions.set(entry.id, entry);
    for (const key of [...mocks.chunks.keys()]) {
      if (key.startsWith(`${entry.id}:`)) {
        mocks.chunks.delete(key);
      }
    }
  }),
  createNativeTransferExpiry: (now = Date.now()) => now + 86_400_000,
  deleteNativeTransferSession: vi.fn(async (id: string) => {
    mocks.sessions.delete(id);
    for (const key of [...mocks.chunks.keys()]) {
      if (key.startsWith(`${id}:`)) {
        mocks.chunks.delete(key);
      }
    }
  }),
  getNativeTransferSession: vi.fn(async (id: string) => mocks.sessions.get(id)),
  listNativeTransferSessions: vi.fn(async () => [...mocks.sessions.values()]),
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
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function createScreenshotStart(bytes: Uint8Array): Promise<AppScreenshotStartMessage> {
  return sha256Hex(bytes).then((sha256) => ({
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
    sha256,
    totalBytes: bytes.byteLength,
    type: 'app.screenshot.start',
    width: 30,
  }));
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunks.clear();
  mocks.sessions.clear();
  mocks.screenshotSaveMock.mockImplementation(async (input: { id?: string }) => ({
    id: input.id ?? 'asset-1',
  }));
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 10_000, usage: 0 }) },
  });
});

it('stages, verifies, saves, and acks native screenshots', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await expect(
    controller.handleScreenshotStart(await createScreenshotStart(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ chunkIndex: 0, type: 'extension.screenshot.chunkRequest' }),
  ]);
  await expect(
    controller.handleScreenshotChunk(await createScreenshotChunk(bytes))
  ).resolves.toEqual([]);

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ assetId: 'capture-1', type: 'extension.screenshot.ack' }),
  ]);
  expect(mocks.screenshotSaveMock).toHaveBeenCalledWith(
    expect.objectContaining({ filename: 'capture.png', tags: ['native-app'] })
  );
  expect(mocks.browserTabsCreateMock).toHaveBeenCalledWith({
    url: 'chrome://editor/?assetId=capture-1',
  });
  expect(mocks.sessions.get('capture-1')).toEqual(
    expect.objectContaining({ kind: 'screenshot-complete' })
  );
});

it('rejects and clears screenshot sessions when chunk hashes mismatch', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const chunk = await createScreenshotChunk(bytes);
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleScreenshotStart(await createScreenshotStart(bytes));

  await expect(
    controller.handleScreenshotChunk({ ...chunk, chunkSha256: '0'.repeat(64) })
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'hash-mismatch', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.screenshotSaveMock).not.toHaveBeenCalled();
  expect(mocks.sessions.has('capture-1')).toBe(false);
});

it('rejects stale screenshot leases and malformed base64 chunks without saving media', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const chunk = await createScreenshotChunk(bytes);
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await expect(
    controller.handleScreenshotStart({
      ...(await createScreenshotStart(bytes)),
      controllerLeaseId: 'other-lease',
    })
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'stale-controller-lease',
      type: 'extension.screenshot.reject',
    }),
  ]);

  await controller.handleScreenshotStart(await createScreenshotStart(bytes));
  await expect(controller.handleScreenshotChunk({ ...chunk, base64: '!!!!' })).resolves.toEqual([
    expect.objectContaining({ reason: 'malformed-message', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.screenshotSaveMock).not.toHaveBeenCalled();
});

it('rejects native media before a current controller lease exists', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController();

  await expect(
    controller.handleScreenshotStart(await createScreenshotStart(bytes))
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'stale-controller-lease',
      type: 'extension.screenshot.reject',
    }),
  ]);
});

it('replaces existing screenshot sessions and rejects incomplete commits', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleScreenshotStart(await createScreenshotStart(bytes));
  await controller.handleScreenshotStart(await createScreenshotStart(bytes));

  await expect(controller.handleScreenshotCommit(createScreenshotCommit())).resolves.toEqual([
    expect.objectContaining({ reason: 'malformed-message', type: 'extension.screenshot.reject' }),
  ]);
});

it('rejects screenshot commits when final blob verification fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleScreenshotStart(await createScreenshotStart(bytes));
  await controller.handleScreenshotChunk(await createScreenshotChunk(bytes));

  await expect(
    controller.handleScreenshotCommit({
      ...createScreenshotCommit(),
      controllerLeaseId: 'other-lease',
    })
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'stale-controller-lease',
      type: 'extension.screenshot.reject',
    }),
  ]);
});
