import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Logger } from '@sniptale/platform/observability/logger/types';
import {
  buildRecordingDownloadWorkflowOptions,
  buildTimestampedRecordingFilename,
  createContentRecordingSaveArtifacts,
  createRecordingSaveHandler,
} from './workflow';
import type { RecordingDownloadSendMessage } from './staged-transfer';
import { resetRecordingDownloadIntentForTests } from './intent';
import { RECORDING_ACTIVATION_KEY } from './workflow.test-support';

function createFakeTraceDate(): Date {
  return new Date('2026-03-20T05:09:10.000Z');
}

function installFileReaderStub(): void {
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'recording-transfer-1'),
  });
  vi.stubGlobal(
    'FileReader',
    class {
      error: Error | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;

      readAsDataURL(blob: Blob): void {
        void blob
          .arrayBuffer()
          .then((buffer) => {
            this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
            this.onload?.();
          })
          .catch((error: Error) => {
            this.error = error;
            this.onerror?.();
          });
      }
    }
  );
}

async function flushRecordingWorkflow(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
}

function runFilenameTests() {
  it('builds a timestamped recording filename from the provided prefix', () => {
    expect(buildTimestampedRecordingFilename('Sniptale_Test', createFakeTraceDate())).toBe(
      'Sniptale_Test_2026-03-20_08-09-10.webm'
    );
  });
}

function runWorkflowOptionTests() {
  it('keeps optional workflow props omitted when the caller does not provide them', () => {
    const logger: Logger = {
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(logger.child).mockReturnValue(logger);

    const options = buildRecordingDownloadWorkflowOptions({
      buildFilename: () => 'test.webm',
      logger,
      props: {
        recordedChunks: [],
      },
      stopMessageFailure: 'stop failed',
    });

    expect(options).toEqual({
      buildFilename: expect.any(Function),
      logger,
      recordedChunks: [],
      stopMessageFailure: 'stop failed',
    });
  });
}

function runSaveHandlerTests() {
  it('creates a stable save handler that delegates through workflow option assembly', () => {
    const logger: Logger = {
      child: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    vi.mocked(logger.child).mockReturnValue(logger);

    const saveRecording = createRecordingSaveHandler({
      buildFilename: () => 'test.webm',
      logger,
      stopMessageFailure: 'stop failed',
    });

    expect(typeof saveRecording).toBe('function');
  });
}

function createLoggerMock(): Logger {
  const logger: Logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  vi.mocked(logger.child).mockReturnValue(logger);
  return logger;
}

function createTestArtifacts(logger: Logger) {
  return createContentRecordingSaveArtifacts({
    filenamePrefix: 'Sniptale_Test',
    logger,
    loggerOptions: {
      chunkCountMessage: 'Chunks',
      cleanupMessage: 'Cleanup complete',
      method: 'log',
      preparedPayloadMessage: 'Prepared payload',
    },
    stopMessageFailure: 'stop failed',
  });
}

function createRecordingSendMessageMock() {
  return vi.fn(async (message: Parameters<RecordingDownloadSendMessage>[0]) => {
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY') {
      return {
        activationKey: RECORDING_ACTIVATION_KEY,
        success: true,
      };
    }
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN') {
      return { runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true };
    }
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF') {
      return { success: true, trustedEventProof: { proofToken: 'proof-1' } };
    }
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY') {
      return { success: true, contentIntent: { requestId: 'request-1', token: 'token-1' } };
    }
    return { success: true };
  });
}

function expectPreparedPayloadLog(logger: Logger): void {
  expect(logger.log).toHaveBeenCalledWith('Chunks', 1);
  expect(logger.log).toHaveBeenCalledWith(
    'Prepared payload',
    expect.objectContaining({
      filename: expect.stringMatching(/^Sniptale_Test_\d{4}-\d{2}-\d{2}_/),
    })
  );
}

function expectRecordingMessages(sendMessage: ReturnType<typeof vi.fn>): void {
  expect(sendMessage).toHaveBeenCalledWith({ type: 'REGION_CAPTURE_STOPPED' });
  expect(sendMessage).toHaveBeenCalledWith({
    base64: Buffer.from('video-data').toString('base64'),
    chunkIndex: 0,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    recordingSessionId: 'recording-session-recording-transfer-1',
    stagedRecordingId: 'staged-recording-recording-transfer-1',
    totalBytes: 10,
    totalChunks: 1,
    type: 'STAGE_RECORDING_DOWNLOAD_CHUNK',
  });
  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      filename: expect.stringMatching(/^Sniptale_Test_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/),
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      mimeType: 'video/webm',
      recordingSessionId: 'recording-session-recording-transfer-1',
      stagedRecordingId: 'staged-recording-recording-transfer-1',
      type: 'SAVE_RECORDING_FOR_DOWNLOAD',
    })
  );
}

function runContentRecordingArtifactTests() {
  it('builds logger-backed save artifacts for content recording owners', async () => {
    const logger = createLoggerMock();
    const artifacts = createTestArtifacts(logger);
    const sendMessage = createRecordingSendMessageMock();
    const didSave = artifacts.saveRecording({
      onChunksReset: vi.fn(),
      recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
      schedule: vi.fn(() => setTimeout(() => undefined, 0)),
      sendMessage,
    });

    expect(didSave).toBe(true);
    await flushRecordingWorkflow();

    expect(artifacts.buildFilename(createFakeTraceDate())).toBe(
      'Sniptale_Test_2026-03-20_08-09-10.webm'
    );
    expectPreparedPayloadLog(logger);
    expectRecordingMessages(sendMessage);
  });
}

function createFailingRecordingSendMessageMock(failingType: string, error: string) {
  return vi.fn(async (message: Parameters<RecordingDownloadSendMessage>[0]) => {
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY') {
      return {
        activationKey: RECORDING_ACTIVATION_KEY,
        success: true,
      };
    }
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN') {
      return { runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true };
    }
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF') {
      return { success: true, trustedEventProof: { proofToken: 'proof-1' } };
    }
    if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY') {
      return { success: true, contentIntent: { requestId: 'request-1', token: 'token-1' } };
    }
    if (message.type === failingType) {
      return { success: false, error };
    }
    return { success: true };
  });
}

function runRecordingFailureTests() {
  it('releases staged recordings and reports failures when stage responses fail', async () => {
    const logger = createLoggerMock();
    const sendMessage = createFailingRecordingSendMessageMock(
      'STAGE_RECORDING_DOWNLOAD_CHUNK',
      'stage rejected'
    );

    const didSave = createTestArtifacts(logger).saveRecording({
      recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
      sendMessage,
    });
    await flushRecordingWorkflow();

    expect(didSave).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RELEASE_RECORDING_DOWNLOAD' })
    );
    expect(logger.error).toHaveBeenCalledWith('Download failed', expect.any(Error));
  });

  it('does not report started downloads when final save responses fail', async () => {
    const logger = createLoggerMock();
    const sendMessage = createFailingRecordingSendMessageMock(
      'SAVE_RECORDING_FOR_DOWNLOAD',
      'save rejected'
    );

    createTestArtifacts(logger).saveRecording({
      recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
      sendMessage,
    });
    await flushRecordingWorkflow();

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'RELEASE_RECORDING_DOWNLOAD' })
    );
    expect(logger.log).not.toHaveBeenCalledWith('Download started');
    expect(logger.error).toHaveBeenCalledWith('Download failed', expect.any(Error));
  });
}

describe('recording download workflow helpers', () => {
  beforeEach(installFileReaderStub);
  afterEach(() => {
    resetRecordingDownloadIntentForTests();
    vi.unstubAllGlobals();
  });

  runFilenameTests();
  runWorkflowOptionTests();
  runSaveHandlerTests();
  runContentRecordingArtifactTests();
  runRecordingFailureTests();
});
