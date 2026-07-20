import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppRecordingChunkMessage,
  AppRecordingStoppedMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  chunks: new Map<string, NativeTransferChunkEntry>(),
  editorFails: false,
  openVideoEditorPageMock: vi.fn(),
  recordingSaveFails: false,
  recordingSaveMock: vi.fn(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
  telemetryFails: false,
  telemetrySaveMock: vi.fn(),
  tombstoneFails: false,
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
    if (mocks.tombstoneFails) {
      throw new Error('tombstone failed');
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
    telemetry: { actionEvents: [], cursorTrack: null, signals: [], viewport: null },
    totalBytes: bytes.byteLength,
    type: 'app.recording.stopped',
    width: 1280,
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

async function stageRecording(bytes: Uint8Array) {
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleRecordingStopped(await createRecordingStopped(bytes));
  return controller;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunks.clear();
  mocks.sessions.clear();
  mocks.editorFails = false;
  mocks.recordingSaveFails = false;
  mocks.telemetryFails = false;
  mocks.tombstoneFails = false;
  mocks.recordingSaveMock.mockImplementation(async () => {
    if (mocks.recordingSaveFails) {
      throw new Error('recording save failed');
    }
  });
  mocks.telemetrySaveMock.mockImplementation(async () => {
    if (mocks.telemetryFails) {
      throw new Error('telemetry save failed');
    }
  });
  mocks.openVideoEditorPageMock.mockImplementation(async () => {
    if (mocks.editorFails) {
      throw new Error('editor failed');
    }
  });
  vi.stubGlobal('atob', (value: string) => Buffer.from(value, 'base64').toString('binary'));
  vi.stubGlobal('navigator', {
    storage: { estimate: vi.fn().mockResolvedValue({ quota: 10_000, usage: 0 }) },
  });
});

it('rejects recording commits when media save fails and keeps staged data retryable', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const controller = await stageRecording(bytes);
  mocks.recordingSaveFails = true;

  await expect(controller.handleRecordingChunk(await createRecordingChunk(bytes))).resolves.toEqual(
    [expect.objectContaining({ reason: 'storage-failed', type: 'extension.recording.reject' })]
  );
  expect(mocks.sessions.has('recording-1')).toBe(true);
});

it('acks recording commits when telemetry or editor opening fails after durable completion', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const controller = await stageRecording(bytes);
  mocks.telemetryFails = true;
  mocks.editorFails = true;

  await expect(controller.handleRecordingChunk(await createRecordingChunk(bytes))).resolves.toEqual(
    [expect.objectContaining({ recordingId: 'recording-1', type: 'extension.recording.ack' })]
  );
  expect(mocks.recordingSaveMock).toHaveBeenCalled();
  expect(mocks.telemetrySaveMock).toHaveBeenCalled();
  expect(mocks.openVideoEditorPageMock).toHaveBeenCalled();
});

it('rejects recording commits when durable completion marker cannot be written', async () => {
  const bytes = new TextEncoder().encode('mp4-bytes');
  const controller = await stageRecording(bytes);
  mocks.tombstoneFails = true;

  await expect(controller.handleRecordingChunk(await createRecordingChunk(bytes))).resolves.toEqual(
    [expect.objectContaining({ reason: 'storage-failed', type: 'extension.recording.reject' })]
  );

  expect(mocks.sessions.get('recording-1')).toEqual(expect.objectContaining({ kind: 'recording' }));
  expect(mocks.recordingSaveMock).toHaveBeenCalled();
  expect(mocks.openVideoEditorPageMock).not.toHaveBeenCalled();
});
