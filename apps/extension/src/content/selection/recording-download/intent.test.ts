import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  requestRecordingDownloadContentIntent,
  resetRecordingDownloadIntentForTests,
} from './intent';

type RecordingDownloadIntentSendMessage = Parameters<
  typeof requestRecordingDownloadContentIntent
>[0]['sendMessage'];
type RecordingDownloadIntentSendMessageMock = ReturnType<
  typeof vi.fn<RecordingDownloadIntentSendMessage>
>;

beforeEach(() => {
  resetRecordingDownloadIntentForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') });
  vi.spyOn(Date, 'now').mockReturnValue(1_000);
});

afterEach(() => {
  resetRecordingDownloadIntentForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createExpiredThenFreshSendMessageMock(): RecordingDownloadIntentSendMessageMock {
  return vi
    .fn<RecordingDownloadIntentSendMessage>()
    .mockResolvedValueOnce({
      activationKey: { expiresAtEpochMs: 500, keyId: 'activation-1', secret: 'secret-1' },
      success: true,
    })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: 'runtime-token-1' }, success: true })
    .mockResolvedValueOnce({ success: true, trustedEventProof: { proofToken: 'proof-1' } })
    .mockResolvedValueOnce({
      contentIntent: {
        requestId: `${MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK}-request-1`,
        token: 'token-1',
      },
      success: true,
    })
    .mockResolvedValueOnce({
      activationKey: {
        expiresAtEpochMs: Number.MAX_SAFE_INTEGER,
        keyId: 'activation-2',
        secret: 'secret-2',
      },
      success: true,
    })
    .mockResolvedValueOnce({ runtimeToken: { runtimeToken: 'runtime-token-2' }, success: true })
    .mockResolvedValueOnce({ success: true, trustedEventProof: { proofToken: 'proof-2' } })
    .mockResolvedValueOnce({
      contentIntent: {
        requestId: `${MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK}-request-1`,
        token: 'token-2',
      },
      success: true,
    });
}

async function requestStagedRecordingDownloadIntent(
  sendMessage: RecordingDownloadIntentSendMessage
) {
  return requestRecordingDownloadContentIntent({
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    sendMessage,
  });
}

function expectRefreshedActivationProof(sendMessage: RecordingDownloadIntentSendMessageMock): void {
  expect(sendMessage).toHaveBeenNthCalledWith(5, {
    purpose: 'recording-download',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(sendMessage).toHaveBeenNthCalledWith(6, {
    actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    activationProof: {
      expiresAtEpochMs: Number.MAX_SAFE_INTEGER,
      keyId: 'activation-2',
      secret: 'secret-2',
    },
    requestId: `${MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK}-request-1`,
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
}

it('discards expired recording-download activation keys before requesting runtime tokens', async () => {
  const sendMessage = createExpiredThenFreshSendMessageMock();

  await requestStagedRecordingDownloadIntent(sendMessage);
  await requestStagedRecordingDownloadIntent(sendMessage);

  expectRefreshedActivationProof(sendMessage);
});
