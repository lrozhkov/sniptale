import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppScreenshotChunkMessage,
  AppScreenshotCommitMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  chunks: new Map<string, NativeTransferChunkEntry>(),
  getNativeTransferSession: vi.fn(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: vi.fn() },
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveScreenshotMediaAssetSafely: vi.fn(),
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
  getNativeTransferSession: mocks.getNativeTransferSession,
  listNativeTransferChunks: vi.fn(async () => []),
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

function createStart(bytes: Uint8Array): Promise<AppScreenshotStartMessage> {
  return sha256Hex(bytes).then((sha256) => ({
    capturedAtEpochMs: 10,
    captureId: 'capture-1',
    chunkCount: 2,
    controllerLeaseId: 'lease-1',
    filename: 'capture.png',
    height: 20,
    mimeType: 'image/png',
    mode: 'screen',
    openEditor: false,
    protocolVersion: 1,
    sha256,
    totalBytes: bytes.byteLength,
    type: 'app.screenshot.start',
    width: 30,
  }));
}

async function createChunk(bytes: Uint8Array): Promise<AppScreenshotChunkMessage> {
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

function createCommit(): AppScreenshotCommitMessage {
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
  mocks.getNativeTransferSession.mockImplementation(async (id: string) => mocks.sessions.get(id));
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

it('rejects and clears transfers when the initial chunk session read fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleScreenshotStart(await createStart(bytes));
  mocks.getNativeTransferSession.mockRejectedValueOnce(new Error('storage failed'));

  await expect(controller.handleScreenshotChunk(await createChunk(bytes))).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
});

it('rejects and clears transfers when the post-stage session reload fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleScreenshotStart(await createStart(bytes));
  mocks.getNativeTransferSession
    .mockImplementationOnce(async (id: string) => mocks.sessions.get(id))
    .mockRejectedValueOnce(new Error('storage failed'));

  await expect(controller.handleScreenshotChunk(await createChunk(bytes))).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
  expect([...mocks.chunks.keys()].some((key) => key.startsWith('capture-1:'))).toBe(false);
});

it('rejects and clears transfers when the initial commit session read fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleScreenshotStart(await createStart(bytes));
  mocks.chunks.set('capture-1:0', {
    blob: new Blob([bytes], { type: 'image/png' }),
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: bytes.byteLength,
    chunkSha256: await sha256Hex(bytes),
    createdAt: 1,
    sessionId: 'capture-1',
  });
  mocks.getNativeTransferSession.mockRejectedValueOnce(new Error('storage failed'));

  await expect(controller.handleScreenshotCommit(createCommit())).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
  expect([...mocks.chunks.keys()].some((key) => key.startsWith('capture-1:'))).toBe(false);
});
