import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildRegionCaptureFilename, saveRegionCaptureRecording } from './recording';
import { buildTimestampedRecordingFilename } from '../recording-download/workflow';
import type { RecordingDownloadSendMessage } from '../recording-download/staged-transfer';
import { resetRecordingDownloadIntentForTests } from '../recording-download/intent';

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
    randomUUID: vi.fn(() => 'region-transfer-1'),
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

function verifiesRegionCaptureFilename(): void {
  expect(buildRegionCaptureFilename(createFakeTraceDate())).toBe(
    'Sniptale_Region_2026-03-20_08-09-10.webm'
  );
  expect(buildRegionCaptureFilename(createFakeTraceDate())).toBe(
    buildTimestampedRecordingFilename('Sniptale_Region', createFakeTraceDate())
  );
}

async function verifiesRegionCaptureSaveFlow(): Promise<void> {
  const harness = createSaveRecordingHarness();

  const didSave = saveRegionCaptureRecording({
    recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
    sendMessage: harness.sendMessage,
    schedule: harness.schedule,
    onChunksReset: harness.onChunksReset,
  });

  expect(didSave).toBe(true);
  expect(harness.sendMessage).toHaveBeenNthCalledWith(1, { type: 'REGION_CAPTURE_STOPPED' });
  await flushRecordingWorkflow();
  expect(harness.sendMessage).toHaveBeenNthCalledWith(6, {
    base64: Buffer.from('video-data').toString('base64'),
    chunkIndex: 0,
    contentIntent: { requestId: 'request-1', token: 'token-1' },
    recordingSessionId: 'recording-session-region-transfer-1',
    stagedRecordingId: 'staged-recording-region-transfer-1',
    totalBytes: 10,
    totalChunks: 1,
    type: 'STAGE_RECORDING_DOWNLOAD_CHUNK',
  });
  expect(harness.sendMessage).toHaveBeenNthCalledWith(
    10,
    expect.objectContaining({
      filename: expect.stringMatching(
        /^Sniptale_Region_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.webm$/
      ),
      contentIntent: { requestId: 'request-1', token: 'token-1' },
      mimeType: 'video/webm',
      recordingSessionId: 'recording-session-region-transfer-1',
      stagedRecordingId: 'staged-recording-region-transfer-1',
      type: 'SAVE_RECORDING_FOR_DOWNLOAD',
    })
  );
  expect(harness.scheduled).toHaveLength(1);

  getRequiredValue(harness.scheduled[0], 'scheduled cleanup')();

  expect(harness.onChunksReset).toHaveBeenCalledOnce();
}

function verifiesNoopWhenNoChunks(): void {
  const sendMessage = vi.fn();

  const didSave = saveRegionCaptureRecording({
    recordedChunks: [],
    sendMessage,
  });

  expect(didSave).toBe(false);
  expect(sendMessage).not.toHaveBeenCalled();
}

async function verifiesStopNotificationWarning(): Promise<void> {
  const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const harness = createSaveRecordingHarness();
  harness.sendMessage.mockRejectedValueOnce(new Error('runtime closed'));

  const didSave = saveRegionCaptureRecording({
    recordedChunks: [new Blob(['video-data'], { type: 'video/webm' })],
    sendMessage: harness.sendMessage,
  });
  await Promise.resolve();
  await Promise.resolve();

  expect(didSave).toBe(true);
  expect(consoleWarnSpy).toHaveBeenCalledWith(
    '[ContentRegionCaptureRecording]',
    'Failed to broadcast region-capture stop notification',
    expect.any(Error)
  );
}

describe('region-capture recording helpers', () => {
  beforeEach(installFileReaderStub);
  afterEach(() => {
    resetRecordingDownloadIntentForTests();
    vi.unstubAllGlobals();
  });

  it('builds a stable download filename from the capture timestamp', verifiesRegionCaptureFilename);
  it(
    'sends download and stop messages and clears chunks after delayed cleanup',
    verifiesRegionCaptureSaveFlow
  );
  it('exposes a stable save handler function seam', () => {
    expect(typeof saveRegionCaptureRecording).toBe('function');
    expect(buildRegionCaptureFilename).toBeTypeOf('function');
  });
  it('no-ops when there are no chunks to persist', verifiesNoopWhenNoChunks);
  it(
    'warns when stop notification rejects after saving the recording',
    verifiesStopNotificationWarning
  );
});
