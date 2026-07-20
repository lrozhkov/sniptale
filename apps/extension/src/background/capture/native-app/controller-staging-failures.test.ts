import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppRecordingStoppedMessage,
  AppScreenshotChunkMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  chunkPutFails: false,
  chunks: new Map<string, NativeTransferChunkEntry>(),
  sessionPutFails: false,
  sessionUpdateFails: false,
  sessions: new Map<string, NativeTransferSessionEntry>(),
}));

vi.mock('@sniptale/platform/browser/tabs', () => ({
  browserTabs: { create: vi.fn() },
}));

vi.mock('@sniptale/platform/security/secure-random-id', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/security/secure-random-id')>()),
  createSecureRandomUuid: () => 'editor-session-1',
}));

vi.mock('../../../platform/navigation/extension-pages/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages/editor')>()),
  buildEditorUrl: ({ assetId }: { assetId?: string }) => `chrome://editor/?assetId=${assetId}`,
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openVideoEditorPage: vi.fn(),
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveRecordingSafely: vi.fn(),
  saveRecordingTelemetrySafely: vi.fn(),
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
  getNativeTransferSession: vi.fn(async (id: string) => mocks.sessions.get(id)),
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
      if (mocks.chunkPutFails) {
        throw new Error('chunk put failed');
      }
      mocks.chunks.set(`${chunk.sessionId}:${chunk.chunkIndex}`, chunk);
      if (mocks.sessionUpdateFails) {
        throw new Error('session update failed');
      }
      mocks.sessions.set(session.id, session);
    }
  ),
  putNativeTransferSession: vi.fn(async (entry: NativeTransferSessionEntry) => {
    if (mocks.sessionPutFails) {
      throw new Error('session put failed');
    }
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
    openEditor: false,
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

async function createRecordingStopped(bytes: Uint8Array): Promise<AppRecordingStoppedMessage> {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    durationMs: 500,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 1,
    recordingId: 'recording-1',
    sha256: await sha256Hex(bytes),
    telemetry: null,
    totalBytes: bytes.byteLength,
    type: 'app.recording.stopped',
    width: 1280,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunkPutFails = false;
  mocks.chunks.clear();
  mocks.sessionPutFails = false;
  mocks.sessionUpdateFails = false;
  mocks.sessions.clear();
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 10_000, usage: 0 }) },
  });
});

it('rejects screenshot starts when session persistence fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  mocks.sessionPutFails = true;

  await expect(
    controller.handleScreenshotStart(await createScreenshotStart(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
});

it('rejects recording starts when session persistence fails', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  mocks.sessionPutFails = true;

  await expect(
    controller.handleRecordingStopped(await createRecordingStopped(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.recording.reject' }),
  ]);
  expect(mocks.sessions.has('recording-1')).toBe(false);
});

it('rejects screenshot chunks when chunk persistence fails', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleScreenshotStart(await createScreenshotStart(bytes));
  mocks.chunkPutFails = true;

  await expect(
    controller.handleScreenshotChunk(await createScreenshotChunk(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
  expect(mocks.chunks.size).toBe(0);
});

it('compensates partial chunks when session update fails after chunk write', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleScreenshotStart(await createScreenshotStart(bytes));
  mocks.sessionUpdateFails = true;

  await expect(
    controller.handleScreenshotChunk(await createScreenshotChunk(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'storage-failed', type: 'extension.screenshot.reject' }),
  ]);
  expect(mocks.sessions.has('capture-1')).toBe(false);
  expect(mocks.chunks.size).toBe(0);
});
