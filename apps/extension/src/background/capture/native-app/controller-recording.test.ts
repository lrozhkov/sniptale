import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { isRecordingEventsDescriptor } from '../../../features/video/project/recording-events/records';
import type { NativeIngestionOutboundMessage } from './ingestion-types';
import { beforeEach, expect, it, vi } from 'vitest';

import type {
  AppRecordingChunkMessage,
  AppRecordingStartedMessage,
  AppRecordingStoppedMessage,
} from '../../../contracts/native-app';
import type { NativeTransferChunkEntry, NativeTransferSessionEntry } from './persistence/contracts';

const mocks = vi.hoisted(() => ({
  historyResume:
    vi.fn<(recordingId: string, lease: string) => Promise<NativeIngestionOutboundMessage[]>>(),
  videoReceipt: vi.fn(),
  ownedReceipts: new Map<string, { durable: true; sha256: string; totalBytes: number }>(),
  chunks: new Map<string, NativeTransferChunkEntry>(),
  openVideoEditorPageMock: vi.fn(),
  recordingSaveMock: vi.fn(),
  sessions: new Map<string, NativeTransferSessionEntry>(),
  telemetrySaveMock: vi.fn(),
}));

vi.mock(
  '../../../composition/persistence/recordings/native-history/store',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('../../../composition/persistence/recordings/native-history/store')
      >();
    return {
      ...original,
      createNativeRecordingHistoryStore: () => ({
        ...original.createNativeRecordingHistoryStore(),
        videoReceipt: mocks.videoReceipt,
      }),
    };
  }
);

vi.mock('./history-ingestion', () => ({
  createNativeRecordingHistoryIngestion: () => ({
    resume: mocks.historyResume,
    handle: vi.fn(async () => []),
  }),
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
    protocolVersion: 2,
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
    protocolVersion: 2,
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
    protocolVersion: 2,
    recordingId: 'recording-1',
    type: 'app.recording.chunk',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.chunks.clear();
  mocks.sessions.clear();
  mocks.historyResume.mockResolvedValue([]);
  mocks.ownedReceipts.clear();
  mocks.videoReceipt.mockImplementation(async (id: string) => {
    const receipt = mocks.ownedReceipts.get(id);
    if (!receipt) throw new Error('missing');
    return receipt;
  });
  mocks.recordingSaveMock.mockImplementation(async (id: string, blob: Blob) => {
    mocks.ownedReceipts.set(id, {
      durable: true,
      sha256: await sha256Hex(new Uint8Array(await blob.arrayBuffer())),
      totalBytes: blob.size,
    });
  });
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
    [
      expect.objectContaining({
        recordingId: 'recording-1',
        type: 'extension.recording.ack',
        receipt: { durable: true, sha256: await sha256Hex(bytes), totalBytes: bytes.byteLength },
      }),
    ]
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
    [
      expect.objectContaining({
        recordingId: 'recording-1',
        type: 'extension.recording.ack',
        receipt: { durable: true, sha256: await sha256Hex(bytes), totalBytes: bytes.byteLength },
      }),
    ]
  );
});

it('recovers lost video receipts without replaying completed commits', async () => {
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
    expect.objectContaining({
      recordingId: 'recording-1',
      type: 'extension.recording.ack',
      receipt: { durable: true, sha256: await sha256Hex(bytes), totalBytes: bytes.byteLength },
    }),
  ]);

  await expect(controller.handleRecordingStarted(createRecordingStarted())).resolves.toEqual([]);
  await expect(controller.handleRecordingStopped(stopped)).resolves.toEqual([
    expect.objectContaining({
      type: 'extension.recording.ack',
      receipt: { durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes },
    }),
  ]);
  await expect(controller.handleRecordingChunk(chunk)).resolves.toEqual([
    expect.objectContaining({
      type: 'extension.recording.ack',
      receipt: { durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes },
    }),
  ]);

  expect(mocks.sessions.get('recording-1')).toEqual(
    expect.objectContaining({ kind: 'recording-complete' })
  );
  expect(mocks.recordingSaveMock).toHaveBeenCalledTimes(1);
  expect(mocks.openVideoEditorPageMock).toHaveBeenCalledTimes(1);
});

it('admits 4096 wire cursor samples and saves MP4 plus seconds exactly once', async () => {
  const { parseNativeAppInboundMessage } = await import('../../../contracts/native-app');
  const bytes = new TextEncoder().encode('mp4-cursor-source-bytes');
  const stopped = await createRecordingStopped(bytes);
  stopped.durationMs = 40960;
  stopped.telemetry = {
    actionEvents: [],
    signals: [],
    viewport: { width: 1280, height: 720, scrollX: 0, scrollY: 0, devicePixelRatio: 1 },
    cursorTrack: {
      captureMode: 'separate',
      skin: {
        color: '#fff',
        hidden: false,
        scale: 1,
        shadow: true,
        animationPreset: 'NONE',
        preset: 'ARROW',
      },
      samples: Array.from({ length: 4096 }, (_, index) => ({
        id: `native-cursor-${index}`,
        time: index * 10,
        x: index % 1280,
        y: index % 720,
        visible: true,
      })),
    },
  };
  const parsed = parseNativeAppInboundMessage(stopped);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok || parsed.value.type !== 'app.recording.stopped')
    throw new Error('Native recording rejected');
  const { createNativeAppIngestionController } = await import('./controller');
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await controller.handleRecordingStopped(parsed.value);
  const chunk = await createRecordingChunk(bytes);
  expect(await controller.handleRecordingChunk(chunk)).toEqual([
    expect.objectContaining({
      type: 'extension.recording.ack',
      receipt: { durable: true, sha256: stopped.sha256, totalBytes: bytes.byteLength },
    }),
  ]);
  expect(mocks.recordingSaveMock).toHaveBeenCalledTimes(1);
  const blob: unknown = mocks.recordingSaveMock.mock.calls[0]?.[1];
  expect(blob).toBeInstanceOf(Blob);
  if (!(blob instanceof Blob)) throw new Error('Missing saved MP4 blob');
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  expect(mocks.telemetrySaveMock).toHaveBeenCalledTimes(1);
  expect(mocks.telemetrySaveMock).toHaveBeenCalledWith(
    expect.objectContaining({
      provenance: expect.objectContaining({ timeUnit: 'seconds' }),
      cursorTrack: expect.objectContaining({
        samples: expect.arrayContaining([
          expect.objectContaining({ id: 'native-cursor-4095', time: 40.95 }),
        ]),
      }),
    })
  );
  const { parseRecordingTelemetryEntry } =
    await import('../../../composition/persistence/recordings/telemetry.guards');
  const savedTelemetry = parseRecordingTelemetryEntry(mocks.telemetrySaveMock.mock.calls[0]?.[0]);
  expect(savedTelemetry?.cursorTrack?.samples).toHaveLength(4096);
  expect(stopped.telemetry.cursorTrack?.samples[4095]?.time).toBe(40950);
  await controller.handleRecordingChunk(chunk);
  expect(mocks.recordingSaveMock).toHaveBeenCalledTimes(1);
  expect(mocks.telemetrySaveMock).toHaveBeenCalledTimes(1);
});

it(
  'persists the offered descriptor, defers automatic editor opening and keeps the video ' +
    'receipt when optional history admission fails',
  async () => {
    if (!isRecordingEventsDescriptor(eventsFixture.descriptor)) throw new Error('Invalid fixture.');
    const { createNativeAppIngestionController } = await import('./controller');
    const controller = createNativeAppIngestionController({
      getCurrentControllerLeaseId: () => 'lease-1',
      isHistoryEnabled: () => true,
    });
    const bytes = new TextEncoder().encode('mp4-with-history');
    const stopped = {
      ...(await createRecordingStopped(bytes)),
      recordingEvents: eventsFixture.descriptor,
    };
    await controller.handleRecordingStopped(stopped);
    expect(mocks.sessions.get('recording-1')?.metadata.recordingEvents).toEqual(
      eventsFixture.descriptor
    );
    mocks.historyResume.mockRejectedValueOnce(new Error('history-storage-failed'));
    expect(await controller.handleRecordingChunk(await createRecordingChunk(bytes))).toEqual([
      expect.objectContaining({ type: 'extension.recording.ack' }),
    ]);
    expect(mocks.sessions.get('recording-1')).toMatchObject({
      kind: 'recording-complete',
      metadata: { recordingEvents: eventsFixture.descriptor },
    });
    expect(mocks.openVideoEditorPageMock).not.toHaveBeenCalled();
    expect(mocks.historyResume).toHaveBeenCalledExactlyOnceWith('recording-1', 'lease-1');
  }
);

it('never deletes an existing history recovery parent when a stopped replay uses a new lease', async () => {
  const { createNativeAppIngestionController } = await import('./controller');
  const bytes = new TextEncoder().encode('mp4-history-parent');
  const stopped = await createRecordingStopped(bytes);
  const original = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await original.handleRecordingStopped(stopped);
  const staged = mocks.sessions.get(stopped.recordingId)!;
  const recoveryParent = {
    ...staged,
    kind: 'recording-complete' as const,
    metadata: { ...staged.metadata, history: { operationId: 'accepted-history' } },
  };
  mocks.sessions.set(stopped.recordingId, recoveryParent);
  const next = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-2',
    isHistoryEnabled: () => true,
  });
  await next.handleRecordingStopped({ ...stopped, controllerLeaseId: 'lease-2' });
  expect(mocks.sessions.get(stopped.recordingId)).toEqual(recoveryParent);
});

it('recovers the completed video on a new lease and rejects changed source facts without deleting it', async () => {
  const bytes = new TextEncoder().encode('committed-video');
  const stopped = await createRecordingStopped(bytes);
  const { createNativeAppIngestionController } = await import('./controller');
  const first = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => 'lease-1',
  });
  await first.handleRecordingStopped(stopped);
  await first.handleRecordingChunk(await createRecordingChunk(bytes));
  const next = createNativeAppIngestionController({ getCurrentControllerLeaseId: () => 'lease-2' });
  const replay = { ...stopped, controllerLeaseId: 'lease-2' };
  expect(await next.handleRecordingStopped(replay)).toEqual([
    expect.objectContaining({ type: 'extension.recording.ack', controllerLeaseId: 'lease-2' }),
  ]);
  for (const mismatch of [{ sha256: 'f'.repeat(64) }, { totalBytes: 1 }, { width: 1 }])
    expect(await next.handleRecordingStopped({ ...replay, ...mismatch })).toEqual([]);
  expect(mocks.recordingSaveMock).toHaveBeenCalledTimes(1);
  expect(mocks.sessions.get(stopped.recordingId)?.kind).toBe('recording-complete');
});
it('recovers the receipt on bootstrap without another Native stopped announcement and rechecks the lease', async () => {
  const bytes = new TextEncoder().encode('bootstrap-receipt');
  const stopped = await createRecordingStopped(bytes);
  const { createNativeAppIngestionController } = await import('./controller');
  let lease = 'lease-1';
  const controller = createNativeAppIngestionController({
    getCurrentControllerLeaseId: () => lease,
  });
  await controller.handleRecordingStopped(stopped);
  await controller.handleRecordingChunk(await createRecordingChunk(bytes));
  const parent = mocks.sessions.get(stopped.recordingId)!;
  mocks.sessions.set(stopped.recordingId, { ...parent, totalBytes: 0 });
  expect(await controller.resumePendingTransfers(lease)).toEqual([
    expect.objectContaining({ type: 'extension.recording.ack' }),
  ]);
  const pending = Promise.withResolvers<{ durable: true; sha256: string; totalBytes: number }>();
  const entered = Promise.withResolvers<void>();
  mocks.videoReceipt.mockImplementationOnce(() => {
    entered.resolve();
    return pending.promise;
  });
  const recovery = controller.handleRecordingStopped(stopped);
  await entered.promise;
  lease = 'lease-2';
  pending.resolve({ durable: true, sha256: stopped.sha256, totalBytes: stopped.totalBytes });
  expect(await recovery).toEqual([]);
});
