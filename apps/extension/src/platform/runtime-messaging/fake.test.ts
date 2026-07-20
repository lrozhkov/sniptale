import { describe, expect, it } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { AiPrivacyProof } from '../../features/ai/privacy';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { FakeRuntimeMessagingTransport } from './fake';

const VALID_PAYLOAD_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

const privacyProof = {
  captureMode: 'selected_editable',
  createdAtEpochMs: Date.now(),
  generation: 'proof-1',
  payloadHash: VALID_PAYLOAD_HASH,
  riskClass: 'safe_text',
  userInitiatedAiExtraction: true,
} satisfies AiPrivacyProof;

async function capturesTypedRequestsAndReturnsTypedResponses() {
  const transport = new FakeRuntimeMessagingTransport();

  transport.onRuntimeMessage(VideoMessageType.GET_RECORDING_STATE, async () => ({
    recordingHealth: 'healthy',
    success: true,
    state: {
      status: 'recording',
      duration: 7,
      countdownEndsAt: null,
      captureMode: null,
      captureSource: null,
      viewportPreset: null,
      error: null,
    },
  }));

  const response = await transport.sendRuntimeMessage({
    type: VideoMessageType.GET_RECORDING_STATE,
  });

  expect(response.success).toBe(true);
  expect(response.state?.duration).toBe(7);
  expect(transport.runtimeRequests).toEqual([{ type: VideoMessageType.GET_RECORDING_STATE }]);
}

async function capturesTypedTabRequestsAndReturnsTypedResponses() {
  const transport = new FakeRuntimeMessagingTransport();

  transport.onTabMessage(VideoMessageType.HIDE_COUNTDOWN, async () => ({
    success: true,
  }));

  const response = await transport.sendTabMessage(5, {
    type: VideoMessageType.HIDE_COUNTDOWN,
  });

  expect(response.success).toBe(true);
  expect(transport.tabRequests).toEqual([
    { tabId: 5, message: { type: VideoMessageType.HIDE_COUNTDOWN } },
  ]);
}

async function failsDeterministicallyOnMalformedRawResponses() {
  const transport = new FakeRuntimeMessagingTransport();

  transport.onRuntimeMessage(MessageType.PROCESS_WITH_LLM, async () => ({
    rawResponse: 'missing success flag',
  }));

  await expect(
    transport.sendRuntimeMessage({
      type: MessageType.PROCESS_WITH_LLM,
      llmSessionToken: 'llm-token-1',
      privacyProof,
      prompt: 'repair this form',
    })
  ).rejects.toThrow(MessageContractError);
}

async function failsDeterministicallyWhenNoRuntimeHandlerIsRegistered() {
  const transport = new FakeRuntimeMessagingTransport();

  await expect(
    transport.sendRuntimeMessage({
      type: MessageType.PROCESS_WITH_LLM,
      llmSessionToken: 'llm-token-1',
      privacyProof,
      prompt: 'repair this form',
    })
  ).rejects.toThrow(MessageContractError);
}

async function failsDeterministicallyWhenNoTabHandlerIsRegistered() {
  const transport = new FakeRuntimeMessagingTransport();

  await expect(
    transport.sendTabMessage(3, {
      type: VideoMessageType.HIDE_COUNTDOWN,
    })
  ).rejects.toThrow(MessageContractError);
}

describe('FakeRuntimeMessagingTransport', () => {
  it(
    'captures typed requests and returns typed responses',
    capturesTypedRequestsAndReturnsTypedResponses
  );
  it(
    'captures typed tab requests and returns typed responses',
    capturesTypedTabRequestsAndReturnsTypedResponses
  );
  it(
    'fails deterministically on malformed raw responses',
    failsDeterministicallyOnMalformedRawResponses
  );
  it(
    'fails deterministically when no runtime handler is registered',
    failsDeterministicallyWhenNoRuntimeHandlerIsRegistered
  );
  it(
    'fails deterministically when no tab handler is registered',
    failsDeterministicallyWhenNoTabHandlerIsRegistered
  );
});
