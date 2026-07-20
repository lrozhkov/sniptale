import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildTabCaptureFilename,
  cleanupTabCaptureResources,
  saveTabCaptureRecording,
} from './recording';
import { buildTimestampedRecordingFilename } from '../../selection/recording-download/workflow';
import type { RecordingDownloadSendMessage } from '../../selection/recording-download/staged-transfer';
import { resetRecordingDownloadIntentForTests } from '../../selection/recording-download/intent';

function createFakeTraceDate(): Date {
  return new Date('2026-03-20T05:09:10.000Z');
}

function createSaveRecordingHarness() {
  const scheduled: Array<() => void> = [];

  return {
    scheduled,
    sendMessage: vi.fn(async (message: Parameters<RecordingDownloadSendMessage>[0]) => {
      if (message.type === 'REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY') {
        return {
          activationKey: {
            expiresAtEpochMs: Number.MAX_SAFE_INTEGER,
            keyId: 'activation-1',
            secret: 'secret-1',
          },
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
    }),
    onChunksReset: vi.fn(),
    schedule: (callback: () => void, _delay: number) => {
      scheduled.push(callback);
      return setTimeout(() => undefined, 0);
    },
  };
}

function installFileReaderStub(): void {
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => 'tab-transfer-1'),
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

function getRequiredValue<T>(value: T | null | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function createStreamWithStops(stops: Array<() => void>) {
  return {
    getTracks: () => stops.map((stop) => ({ stop })),
  };
}

function verifiesTabCaptureFilename(): void {
  expect(buildTabCaptureFilename(createFakeTraceDate())).toBe(
    'Sniptale_TabCapture_2026-03-20_08-09-10.webm'
  );
  expect(buildTabCaptureFilename(createFakeTraceDate())).toBe(
    buildTimestampedRecordingFilename('Sniptale_TabCapture', createFakeTraceDate())
  );
}

function verifiesStableSaveHandler(): void {
  expect(typeof saveTabCaptureRecording).toBe('function');
  expect(buildTabCaptureFilename).toBeTypeOf('function');
}

async function verifiesTabCaptureSaveFlow(): Promise<void> {
  const harness = createSaveRecordingHarness();

  const didSave = saveTabCaptureRecording({
    recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
    sendMessage: harness.sendMessage,
    schedule: harness.schedule,
    onChunksReset: harness.onChunksReset,
  });

  expect(didSave).toBe(true);
  expect(harness.sendMessage).toHaveBeenNthCalledWith(1, { type: 'REGION_CAPTURE_STOPPED' });
  await flushRecordingWorkflow();
  expectTabCaptureDownloadMessages(harness.sendMessage);
  expect(harness.scheduled).toHaveLength(1);

  getRequiredValue(harness.scheduled[0], 'scheduled cleanup')();

  expect(harness.onChunksReset).toHaveBeenCalledOnce();
}

function expectTabCaptureDownloadMessages(sendMessage: ReturnType<typeof vi.fn>): void {
  expect(sendMessage).toHaveBeenNthCalledWith(6, {
    base64: Buffer.from('video-data').toString('base64'),
    chunkIndex: 0,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    recordingSessionId: 'recording-session-tab-transfer-1',
    stagedRecordingId: 'staged-recording-tab-transfer-1',
    totalBytes: 10,
    totalChunks: 1,
    type: 'STAGE_RECORDING_DOWNLOAD_CHUNK',
  });
  expect(sendMessage).toHaveBeenNthCalledWith(
    10,
    expect.objectContaining({
      filename: expect.stringMatching(
        /^Sniptale_TabCapture_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      ),
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      mimeType: 'video/webm',
      recordingSessionId: 'recording-session-tab-transfer-1',
      stagedRecordingId: 'staged-recording-tab-transfer-1',
      type: 'SAVE_RECORDING_FOR_DOWNLOAD',
    })
  );
}

describe('tab-capture-fallback recording helpers', () => {
  beforeEach(installFileReaderStub);
  afterEach(() => {
    resetRecordingDownloadIntentForTests();
    vi.unstubAllGlobals();
  });

  it('builds a stable download filename from the capture timestamp', verifiesTabCaptureFilename);
  it('exposes a stable save handler function seam', verifiesStableSaveHandler);
  it(
    'sends download and stop messages and clears chunks after delayed cleanup',
    verifiesTabCaptureSaveFlow
  );
});

describe('tab-capture-fallback recording guardrails', () => {
  beforeEach(installFileReaderStub);
  afterEach(() => {
    resetRecordingDownloadIntentForTests();
    vi.unstubAllGlobals();
  });

  it('no-ops when there are no chunks to persist', () => {
    const sendMessage = vi.fn();

    const didSave = saveTabCaptureRecording({
      recordedChunks: [],
      sendMessage,
    });

    expect(didSave).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('tab-capture-fallback stream cleanup', () => {
  it('stops tracks for both capture and microphone streams', () => {
    const captureStops = [vi.fn(), vi.fn()];
    const micStops = [vi.fn()];

    cleanupTabCaptureResources({
      currentStream: createStreamWithStops(captureStops),
      micStream: createStreamWithStops(micStops),
    });

    for (const stop of [...captureStops, ...micStops]) {
      expect(stop).toHaveBeenCalledOnce();
    }
  });
});

describe('tab-capture-fallback recording warnings', () => {
  beforeEach(installFileReaderStub);
  afterEach(() => {
    resetRecordingDownloadIntentForTests();
    vi.unstubAllGlobals();
  });

  it('warns when stop notification rejects after saving the recording', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const harness = createSaveRecordingHarness();
    harness.sendMessage.mockRejectedValueOnce(new Error('runtime closed'));

    const didSave = saveTabCaptureRecording({
      recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
      sendMessage: harness.sendMessage,
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(didSave).toBe(true);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[ContentTabCaptureFallbackRecording]',
      'Failed to broadcast tab-capture stop notification',
      expect.any(Error)
    );
  });
});
