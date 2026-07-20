import { afterEach, expect, it, vi } from 'vitest';

import { resetRecordingDownloadIntentForTests } from './intent';
import { stageRecordingDownload, type RecordingDownloadSendMessage } from './staged-transfer';
import type { Logger } from '@sniptale/platform/observability/logger/types';

const logger: Logger = {
  child: () => logger,
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

function installFileReaderStub(): void {
  vi.stubGlobal(
    'FileReader',
    class {
      error: Error | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: string | null = null;

      readAsDataURL(blob: Blob): void {
        void blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload?.();
        });
      }
    }
  );
}

function createSuccessfulSender() {
  return vi.fn(async (message: Parameters<RecordingDownloadSendMessage>[0]) => {
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
  });
}

afterEach(() => {
  resetRecordingDownloadIntentForTests();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('uses getRandomValues for staged ids when randomUUID is unavailable', async () => {
  installFileReaderStub();
  vi.stubGlobal('crypto', {
    getRandomValues: vi.fn((bytes: Uint8Array) => {
      bytes.fill(10);
      return bytes;
    }),
  });
  const sendMessage = createSuccessfulSender();

  await stageRecordingDownload({
    blob: new Blob(['video-data'], { type: 'video/webm' }),
    filename: 'recording.webm',
    logger,
    sendMessage,
  });

  expect(sendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      recordingSessionId: `recording-session-${'0a'.repeat(16)}`,
      stagedRecordingId: `staged-recording-${'0a'.repeat(16)}`,
      type: 'STAGE_RECORDING_DOWNLOAD_CHUNK',
    })
  );
});

it('fails closed before staging when secure random ids are unavailable', async () => {
  vi.stubGlobal('crypto', {});
  const sendMessage = createSuccessfulSender();

  await expect(
    stageRecordingDownload({
      blob: new Blob(['video-data'], { type: 'video/webm' }),
      filename: 'recording.webm',
      logger,
      sendMessage,
    })
  ).rejects.toThrow('Secure recording download id generation is unavailable.');
  expect(sendMessage).not.toHaveBeenCalled();
});
