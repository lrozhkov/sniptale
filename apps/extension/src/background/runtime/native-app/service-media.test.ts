import eventsFixture from '../../../features/video/project/recording-events/fixtures.json';
import { parseNativeHistoryInboundMessage } from '../../../contracts/native-app/parser-attachments';
import { expect, it, vi } from 'vitest';

import type { NativeAppIngestionController } from '../../capture/native-app/controller';

function createIngestion(): NativeAppIngestionController {
  return {
    handleHistory: vi.fn(async () => []),
    resumePendingHistoryTransfers: vi.fn(async () => []),
    handleRecordingChunk: vi.fn(async () => [
      {
        controllerLeaseId: 'lease-1',
        protocolVersion: 2,
        recordingId: 'r1',
        type: 'extension.recording.ack',
        receipt: { durable: true, sha256: 'a'.repeat(64), totalBytes: 1 },
      } as const,
    ]),
    handleRecordingStarted: vi.fn(async () => []),
    handleRecordingStopped: vi.fn(async () => []),
    handleScreenshotChunk: vi.fn(async () => []),
    handleScreenshotCommit: vi.fn(async () => []),
    handleScreenshotStart: vi.fn(async () => []),
    resumePendingTransfers: vi.fn(async () => []),
  };
}

it('dispatches native media and posts async responses', async () => {
  const ingestion = createIngestion();
  const post = vi.fn();
  const warn = vi.fn();
  const { dispatchNativeMediaMessage } = await import('./service-media');
  const { postNativeResponses } = await import('./response-posting');

  dispatchNativeMediaMessage({
    hasGrantedLease: () => false,
    ingestion,
    message: createRecordingChunkMessage(),
    postResponses: post,
    warn,
  });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('app.recording.chunk'));

  dispatchNativeMediaMessage({
    hasGrantedLease: () => true,
    ingestion,
    message: createRecordingChunkMessage(),
    postResponses: (responses) => postNativeResponses(responses, post, warn),
    warn,
  });
  await Promise.resolve();
  expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'extension.recording.ack' }));

  postNativeResponses(Promise.reject(new Error('failed')), post, warn);
  await Promise.resolve();
  expect(warn).toHaveBeenCalledWith('Native response failed');

  postNativeResponses([], post, warn);
  await Promise.resolve();
});

it('dispatches every native media message type to the ingestion controller', async () => {
  const ingestion = createIngestion();
  const { dispatchNativeMediaMessage } = await import('./service-media');

  for (const message of createMediaMessages()) {
    dispatchNativeMediaMessage({
      hasGrantedLease: () => true,
      ingestion,
      message,
      postResponses: vi.fn(),
      warn: vi.fn(),
    });
  }

  expect(ingestion.handleScreenshotStart).toHaveBeenCalledTimes(1);
  expect(ingestion.handleScreenshotChunk).toHaveBeenCalledTimes(1);
  expect(ingestion.handleScreenshotCommit).toHaveBeenCalledTimes(1);
  expect(ingestion.handleRecordingStopped).toHaveBeenCalledTimes(1);
  expect(ingestion.handleRecordingChunk).toHaveBeenCalledTimes(1);
});

function createRecordingChunkMessage() {
  return {
    base64: '',
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 0,
    chunkSha256: '0'.repeat(64),
    controllerLeaseId: 'lease-1',
    protocolVersion: 2,
    recordingId: 'r1',
    type: 'app.recording.chunk',
  } as const;
}

function createMediaMessages() {
  return [
    createScreenshotStartMessage(),
    createScreenshotChunkMessage(),
    createScreenshotCommitMessage(),
    createRecordingStoppedMessage(),
    createRecordingChunkMessage(),
  ] as const;
}

function createScreenshotStartMessage() {
  return {
    capturedAtEpochMs: 1,
    captureId: 'capture-1',
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    filename: 'capture.png',
    height: 20,
    mimeType: 'image/png',
    mode: 'screen',
    openEditor: false,
    protocolVersion: 2,
    sha256: '0'.repeat(64),
    totalBytes: 3,
    type: 'app.screenshot.start',
    width: 30,
  } as const;
}

function createScreenshotChunkMessage() {
  return {
    base64: 'AQID',
    captureId: 'capture-1',
    chunkByteOffset: 0,
    chunkIndex: 0,
    chunkRawBytes: 3,
    chunkSha256: '0'.repeat(64),
    controllerLeaseId: 'lease-1',
    protocolVersion: 2,
    type: 'app.screenshot.chunk',
  } as const;
}

function createScreenshotCommitMessage() {
  return {
    captureId: 'capture-1',
    controllerLeaseId: 'lease-1',
    protocolVersion: 2,
    type: 'app.screenshot.commit',
  } as const;
}

function createRecordingStoppedMessage() {
  return {
    chunkCount: 1,
    controllerLeaseId: 'lease-1',
    durationMs: 100,
    filename: 'recording.mp4',
    fps: 30,
    height: 720,
    mimeType: 'video/mp4',
    openEditor: false,
    protocolVersion: 2,
    recordingId: 'r1',
    sha256: '0'.repeat(64),
    telemetry: null,
    totalBytes: 3,
    type: 'app.recording.stopped',
    width: 1280,
  } as const;
}

it('routes all negotiated history forms through the video lease check before ingestion', async () => {
  const ingestion = createIngestion();
  const { dispatchNativeMediaMessage } = await import('./service-media');
  const descriptor = {
    format: 'cursor-trajectory-v1',
    formatVersion: 1,
    algorithm: 'sed-window-v1',
    encoding: 'json-ascii-int-v1',
    trajectoryId: 'a'.repeat(32),
    state: 'complete',
    finalized: true,
    totalBlocks: 1,
    totalRecords: 3,
    totalSamples: 1,
    totalBytes: 100,
    streamSha256: 'b'.repeat(64),
  };
  const identity = {
    protocolVersion: 2,
    controllerLeaseId: 'lease-1',
    recordingId: eventsFixture.recordingId,
  };
  const chunk = {
    requestId: 'request',
    sequence: 0,
    blockBytes: 3,
    blockSha256: 'c'.repeat(64),
    chunkIndex: 0,
    chunkCount: 1,
    chunkByteOffset: 0,
    chunkRawBytes: 3,
    chunkSha256: 'd'.repeat(64),
    base64: 'AQID',
  };
  const cursor = { ...identity, trajectoryId: descriptor.trajectoryId };
  const events = { ...identity, eventStreamId: eventsFixture.eventStreamId };
  const messages = [
    {
      ...cursor,
      type: 'app.recording.attachment.available',
      videoSha256: 'd'.repeat(64),
      descriptor,
    },
    {
      ...cursor,
      type: 'app.recording.attachment.manifest',
      requestId: 'request',
      descriptor,
      fromSequence: 0,
      nextSequence: null,
      entries: [
        {
          sequence: 0,
          startTimeUs: 0,
          endTimeUs: 1000,
          recordCount: 3,
          sampleCount: 1,
          byteLength: 100,
          blockSha256: 'c'.repeat(64),
          prefixSha256: descriptor.streamSha256,
        },
      ],
    },
    { ...cursor, type: 'app.recording.attachment.chunk', ...chunk },
    {
      ...events,
      type: 'app.recording.events.available',
      videoSha256: 'd'.repeat(64),
      descriptor: eventsFixture.descriptor,
    },
    {
      ...events,
      type: 'app.recording.events.manifest',
      requestId: 'request',
      descriptor: eventsFixture.descriptor,
      fromSequence: 0,
      nextSequence: null,
      entries: eventsFixture.manifest,
    },
    { ...events, type: 'app.recording.events.chunk', ...chunk },
  ];
  for (const raw of messages) {
    const parsed = parseNativeHistoryInboundMessage(raw);
    if (!parsed.ok) throw new Error(parsed.error);
    const post = vi.fn();
    const warn = vi.fn();
    vi.mocked(ingestion.handleHistory).mockClear();
    dispatchNativeMediaMessage({
      hasGrantedLease: () => false,
      ingestion,
      message: parsed.value,
      postResponses: post,
      warn,
    });
    expect(ingestion.handleHistory).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledExactlyOnceWith(`Rejected stale native ${parsed.value.type}`);
    dispatchNativeMediaMessage({
      hasGrantedLease: () => true,
      ingestion,
      message: parsed.value,
      postResponses: post,
      warn,
    });
    expect(ingestion.handleHistory).toHaveBeenCalledExactlyOnceWith(parsed.value);
    expect(post).toHaveBeenCalledOnce();
  }
});
