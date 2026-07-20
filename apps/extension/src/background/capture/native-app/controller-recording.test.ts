import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppRecordingChunkMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  chunks: new Map<string, NativeTransferChunkEntry>(),
  openVideoEditorPageMock: vi.fn(),
  recordingSaveMock: vi.fn(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
  telemetrySaveMock: vi.fn(),
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openVideoEditorPage: mocks.openVideoEditorPageMock,
}));

vi.mock('../../../workflows/media-hub/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../workflows/media-hub/store')>()),
  saveRecordingSafely: mocks.recordingSaveMock,
  saveRecordingTelemetrySafely: mocks.telemetrySaveMock,
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
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
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
    openEditor: true,
    protocolVersion: 1,
    recordingId: 'recording-1',
    sha256: await sha256Hex(bytes),
    telemetry: null,
    totalBytes: bytes.byteLength,
    type: 'app.recording.stopped',
    width: 1280,
  };
}

function createRecordingStarted(): AppRecordingStartedMessage {
  return {
    controllerLeaseId: 'lease-1',
    effectiveQuality: {
      audioBitrateKbps: 160,
      audioSourceMode: 'mixed',
      effectiveAudioBitrateKbps: 160,
      effectiveFps: 30,
      effectiveVideoBitrateMbps: 12,
      encoder: 'hardware',
      frameRate: 30,
      quality: 'HIGH',
      videoBitrateMbpsOverride: null,
      warnings: [],
    },
    protocolVersion: 1,
    recordingId: 'recording-1',
    requestedQuality: {
      audioBitrateKbps: 160,
      audioSourceMode: 'mixed',
      frameRate: 30,
      quality: 'HIGH',
      videoBitrateMbpsOverride: null,
    },
    requestedSettingsRevision: 'settings-1',
    source: { mode: 'screen' },
    startedAtEpochMs: 1,
    timebase: {
      id: 'timebase-1',
      startedAtEpochMs: 1,
      startedAtMonotonicNs: '1000',
      units: 'milliseconds',
    },
    type: 'app.recording.started',
  };
}

async function createRecordingChunk(bytes: Uint8Array): Promise<AppRecordingChunkMessage> {
  return {
    base64: toBase64(bytes),
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: bytes.byteLength,
    chunkSha256: await sha256Hex(bytes),
    controllerLeaseId: 'lease-1',
    protocolVersion: 1,
    recordingId: 'recording-1',
    type: 'app.recording.chunk',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunks.clear();
  mocks.sessions.clear();
  mocks.recordingSaveMock.mockResolvedValue(undefined);
  mocks.telemetrySaveMock.mockResolvedValue(undefined);
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 10_000, usage: 0 }) },
  });
});

it('requests chunks, saves complete recordings, opens editor, and acks', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await expect(
    controller.handleRecordingStopped(await createRecordingStopped(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ chunkIndex: 0, type: 'extension.recording.chunkRequest' }),
  ]);
  await expect(controller.handleRecordingChunk(await createRecordingChunk(bytes))).resolves.toEqual(
    [expect.objectContaining({ recordingId: 'recording-1', type: 'extension.recording.ack' })]
  );
  expect(mocks.recordingSaveMock).toHaveBeenCalledWith(
    'recording-1',
    expect.any(Blob),
    'recording.mp4'
  );
  expect(mocks.openVideoEditorPageMock).toHaveBeenCalledWith(null, 'recording-1');
});

it('rejects stale chunks and resumes matching sessions from the next missing chunk', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleRecordingStopped(await createRecordingStopped(bytes));
  await expect(
    controller.handleRecordingChunk({
      ...(await createRecordingChunk(bytes)),
      controllerLeaseId: 'other-lease',
    })
  ).resolves.toEqual([
    expect.objectContaining({
      reason: 'stale-controller-lease',
      type: 'extension.recording.reject',
    }),
  ]);
  await expect(controller.resumePendingTransfers('lease-1')).resolves.toEqual([
    expect.objectContaining({
      chunkIndex: 0,
      recordingId: 'recording-1',
      type: 'extension.recording.chunkRequest',
    }),
  ]);
});

it('rejects recording starts without storage budget and malformed chunks without sessions', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 1, usage: 1 }) },
  });
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await expect(
    controller.handleRecordingStopped(await createRecordingStopped(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ reason: 'quota-exceeded', type: 'extension.recording.reject' }),
  ]);
  await expect(controller.handleRecordingChunk(await createRecordingChunk(bytes))).resolves.toEqual(
    [expect.objectContaining({ reason: 'malformed-message', type: 'extension.recording.reject' })]
  );
});

it('reuses existing recording sessions when chunks are still missing', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleRecordingStopped(await createRecordingStopped(bytes));
  await expect(
    controller.handleRecordingStopped(await createRecordingStopped(bytes))
  ).resolves.toEqual([
    expect.objectContaining({ chunkIndex: 0, type: 'extension.recording.chunkRequest' }),
  ]);
});

it('does not let replayed recording starts overwrite active transfer sessions', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleRecordingStarted(createRecordingStarted());
  await controller.handleRecordingStopped(await createRecordingStopped(bytes));
  await expect(controller.handleRecordingStarted(createRecordingStarted())).resolves.toEqual([]);
  await expect(controller.handleRecordingChunk(await createRecordingChunk(bytes))).resolves.toEqual(
    [expect.objectContaining({ recordingId: 'recording-1', type: 'extension.recording.ack' })]
  );
});

it('keeps completed recording tombstones from replaying commits after cleanup', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const stopped = await createRecordingStopped(bytes);
  const chunk = await createRecordingChunk(bytes);
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });

  await controller.handleRecordingStarted(createRecordingStarted());
  await controller.handleRecordingStopped(stopped);
  await expect(controller.handleRecordingChunk(chunk)).resolves.toEqual([
    expect.objectContaining({ recordingId: 'recording-1', type: 'extension.recording.ack' }),
  ]);

  await expect(controller.handleRecordingStarted(createRecordingStarted())).resolves.toEqual([]);
  await expect(controller.handleRecordingStopped(stopped)).resolves.toEqual([
    expect.objectContaining({ reason: 'duplicate-or-replay', type: 'extension.recording.reject' }),
  ]);
  await expect(controller.handleRecordingChunk(chunk)).resolves.toEqual([
    expect.objectContaining({ reason: 'duplicate-or-replay', type: 'extension.recording.reject' }),
  ]);

  expect(mocks.sessions.get('recording-1')).toEqual(
    expect.objectContaining({ kind: 'recording-complete' })
  );
  expect(mocks.recordingSaveMock).toHaveBeenCalledTimes(1);
  expect(mocks.openVideoEditorPageMock).toHaveBeenCalledTimes(1);
});
