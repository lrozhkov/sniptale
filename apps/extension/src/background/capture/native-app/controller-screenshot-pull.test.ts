import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppScreenshotChunkMessage,
  AppScreenshotStartMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  chunks: new Map<string, NativeTransferChunkEntry>(),
  getNativeTransferSession: vi.fn(),
  putNativeTransferSession: vi.fn(),
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
  putNativeTransferSession: mocks.putNativeTransferSession,
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

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const combined = new Uint8Array(left.byteLength + right.byteLength);
  combined.set(left, 0);
  combined.set(right, left.byteLength);
  return combined;
}

async function createScreenshotStart(
  bytes: Uint8Array,
  chunkCount = 2
): Promise<AppScreenshotStartMessage> {
  return {
    capturedAtEpochMs: 10,
    captureId: 'capture-1',
    chunkCount,
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

async function createScreenshotChunk(args: {
  bytes: Uint8Array;
  chunkByteOffset: number;
  chunkIndex: number;
}): Promise<AppScreenshotChunkMessage> {
  return {
    base64: toBase64(args.bytes),
    captureId: 'capture-1',
    chunkByteOffset: args.chunkByteOffset,
    chunkIndex: args.chunkIndex,
    chunkRawBytes: args.bytes.byteLength,
    chunkSha256: await sha256Hex(args.bytes),
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    type: 'app.screenshot.chunk',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunks.clear();
  mocks.sessions.clear();
  mocks.getNativeTransferSession.mockImplementation(async (id: string) => mocks.sessions.get(id));
  mocks.putNativeTransferSession.mockImplementation(async (entry: NativeTransferSessionEntry) => {
    mocks.sessions.set(entry.id, entry);
  });
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
});

it('requests the first screenshot chunk when a transfer starts', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await expect(
    controller.handleScreenshotStart(await createScreenshotStart(bytes, 1))
  ).resolves.toEqual([
    {
      captureId: 'capture-1',
      chunkIndex: 0,
      controllerLeaseId: 'lease-1',
      protocolVersion: 1,
      type: 'extension.screenshot.chunkRequest',
    },
  ]);
});

it('requests the next missing screenshot chunk after staging a partial transfer', async () => {
  const chunk0 = new TextEncoder().encode('png-');
  const chunk1 = new TextEncoder().encode('bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleScreenshotStart(await createScreenshotStart(concatBytes(chunk0, chunk1)));

  await expect(
    controller.handleScreenshotChunk(
      await createScreenshotChunk({ bytes: chunk0, chunkByteOffset: 0, chunkIndex: 0 })
    )
  ).resolves.toEqual([
    expect.objectContaining({
      captureId: 'capture-1',
      chunkIndex: 1,
      type: 'extension.screenshot.chunkRequest',
    }),
  ]);
});

it('returns the next missing chunk for replayed screenshot starts on active sessions', async () => {
  const chunk0 = new TextEncoder().encode('png-');
  const chunk1 = new TextEncoder().encode('bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  const start = await createScreenshotStart(concatBytes(chunk0, chunk1));

  await controller.handleScreenshotStart(start);
  await controller.handleScreenshotChunk(
    await createScreenshotChunk({ bytes: chunk0, chunkByteOffset: 0, chunkIndex: 0 })
  );

  await expect(controller.handleScreenshotStart(start)).resolves.toEqual([
    expect.objectContaining({
      captureId: 'capture-1',
      chunkIndex: 1,
      type: 'extension.screenshot.chunkRequest',
    }),
  ]);
});

it('returns no screenshot chunk request after the final chunk is staged', async () => {
  const chunk0 = new TextEncoder().encode('png-');
  const chunk1 = new TextEncoder().encode('bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleScreenshotStart(await createScreenshotStart(concatBytes(chunk0, chunk1)));
  await controller.handleScreenshotChunk(
    await createScreenshotChunk({ bytes: chunk0, chunkByteOffset: 0, chunkIndex: 0 })
  );

  await expect(
    controller.handleScreenshotChunk(
      await createScreenshotChunk({
        bytes: chunk1,
        chunkByteOffset: chunk0.byteLength,
        chunkIndex: 1,
      })
    )
  ).resolves.toEqual([]);
});

it('rejects screenshot commits before every chunk has been staged', async () => {
  const chunk0 = new TextEncoder().encode('png-');
  const chunk1 = new TextEncoder().encode('bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleScreenshotStart(await createScreenshotStart(concatBytes(chunk0, chunk1)));
  await controller.handleScreenshotChunk(
    await createScreenshotChunk({ bytes: chunk0, chunkByteOffset: 0, chunkIndex: 0 })
  );

  await expect(
    controller.handleScreenshotCommit({
      captureId: 'capture-1',
      controllerLeaseId: 'lease-1',
      protocolVersion: 1,
      type: 'app.screenshot.commit',
    })
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'malformed-message', type: 'extension.screenshot.reject' }),
  ]);
});

it('keeps stale lease and storage-failure screenshot start rejection behavior', async () => {
  const bytes = new TextEncoder().encode('png-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await expect(
    controller.handleScreenshotStart({
      ...(await createScreenshotStart(bytes, 1)),
      controllerLeaseId: 'other-lease',
    })
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'stale-controller-lease',
      type: 'extension.screenshot.reject',
    }),
  ]);

  mocks.putNativeTransferSession.mockRejectedValueOnce(new Error('storage failed'));
  await expect(
    controller.handleScreenshotStart(await createScreenshotStart(bytes, 1))
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'storage-failed',
      type: 'extension.screenshot.reject',
    }),
  ]);
});
