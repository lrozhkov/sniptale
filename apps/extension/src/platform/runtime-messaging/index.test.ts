import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { installActiveTraceObserver } from '@sniptale/platform/observability/message-tracer/runtime';
import type { AiPrivacyProof } from '../../features/ai/privacy';
import { RUNTIME_MESSAGE_FRESHNESS_FIELD } from '@sniptale/platform/security/runtime-message-freshness';
import {
  getErrorMessage,
  sendRuntimeMessage as sendRuntimeMessageViaFacade,
  sendTabMessage as sendTabMessageViaFacade,
} from './index';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { createRuntimeMessagingTransport } from './index';

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

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'chrome');
});

function createRecordingStateResponse() {
  return {
    recordingHealth: 'healthy',
    success: true,
    state: {
      status: 'recording',
      duration: 42,
      countdownEndsAt: null,
      captureMode: null,
      captureSource: null,
      viewportPreset: null,
      error: null,
    },
  };
}

function createTransport() {
  return createRuntimeMessagingTransport({
    runtimeSendMessage: async () => createRecordingStateResponse(),
    tabSendMessage: async () => ({
      success: true,
    }),
  });
}

function installTraceHarness() {
  const events: unknown[] = [];
  const dispose = installActiveTraceObserver({
    config: {
      batchInterval: 100,
      batchSize: 10,
      enabled: true,
      maxBufferSize: 100,
      maxPayloadSize: 1000,
      maxReconnectAttempts: 2,
      reconnectInterval: 1000,
      sanitizeKeys: ['token'],
      wsPort: 9223,
      wsUrl: 'ws://localhost',
    },
    context: 'popup',
    generateCorrelationId: vi.fn(() => 'corr-1'),
    safeStringify: vi.fn((value: unknown) => JSON.stringify(value)),
    sanitizeValue: vi.fn((value: unknown) => ({ sanitized: value })),
    sendEvent: (event) => events.push(event),
    sendTimestamps: new Map<string, number>(),
  });

  return { dispose, events };
}

async function sendRecordingStateMessage() {
  const transport = createTransport();
  await transport.sendRuntimeMessage({
    type: VideoMessageType.GET_RECORDING_STATE,
  });
}

async function infersAndValidatesRuntimeResponsesByMessageType() {
  const transport = createTransport();

  const response = await transport.sendRuntimeMessage({
    type: VideoMessageType.GET_RECORDING_STATE,
  });

  expect(response.success).toBe(true);
  expect(response.recordingHealth).toBe('healthy');
  expect(response.state?.duration).toBe(42);
}

async function rejectsMalformedRuntimeResponses() {
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage: async () => ({
      rawResponse: 'missing success flag',
    }),
    tabSendMessage: async () => ({
      success: true,
    }),
  });

  await expect(
    transport.sendRuntimeMessage({
      type: MessageType.PROCESS_WITH_LLM,
      llmSessionToken: 'llm-token-1',
      privacyProof,
      prompt: 'hello',
    })
  ).rejects.toThrow(MessageContractError);
}

async function rejectsLegacyLlmRuntimeResponsePayloads() {
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage: async () => ({
      success: true,
      cleanedResponse: '{"private":true}',
    }),
    tabSendMessage: async () => ({
      success: true,
    }),
  });

  await expect(
    transport.sendRuntimeMessage({
      type: MessageType.PROCESS_WITH_LLM,
      llmSessionToken: 'llm-token-1',
      privacyProof,
      prompt: 'hello',
    })
  ).rejects.toThrow(MessageContractError);
}

async function infersAndValidatesTabResponsesByMessageType() {
  const transport = createTransport();

  const response = await transport.sendTabMessage(7, {
    type: VideoMessageType.HIDE_COUNTDOWN,
  });

  expect(response.success).toBe(true);
}

async function rejectsMalformedTabResponses() {
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage: async () => createRecordingStateResponse(),
    tabSendMessage: async () => ({
      rawResponse: 'missing success flag',
    }),
  });

  await expect(
    transport.sendTabMessage(7, {
      type: 'CHECK_REGION_CAPTURE_SUPPORT',
    })
  ).rejects.toThrow(MessageContractError);
}

async function emitsTraceEventsThroughTheCanonicalTransportSeam() {
  const { dispose, events } = installTraceHarness();
  vi.spyOn(Date, 'now').mockReturnValueOnce(100).mockReturnValueOnce(110).mockReturnValueOnce(135);

  await sendRecordingStateMessage();

  expect(events).toEqual([
    expect.objectContaining({
      dir: 'send',
      from: 'popup',
      to: 'bg',
      type: VideoMessageType.GET_RECORDING_STATE,
    }),
    expect.objectContaining({
      dir: 'recv',
      type: `${VideoMessageType.GET_RECORDING_STATE}_RESPONSE`,
      duration: 35,
    }),
  ]);

  dispose();
}

async function routesRootFacadeHelpersThroughTheDefaultChromeTransport() {
  const runtimeSendMessage = vi.fn(async () => createRecordingStateResponse());
  const tabSendMessage = vi.fn(async () => ({ success: true }));

  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: { sendMessage: runtimeSendMessage },
      tabs: { sendMessage: tabSendMessage },
    },
  });

  const runtimeResponse = await sendRuntimeMessageViaFacade({
    type: VideoMessageType.GET_RECORDING_STATE,
  });
  const tabResponse = await sendTabMessageViaFacade(11, {
    type: VideoMessageType.HIDE_COUNTDOWN,
  });

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      [RUNTIME_MESSAGE_FRESHNESS_FIELD]: expect.objectContaining({
        issuedAtEpochMs: expect.any(Number),
        nonce: expect.any(String),
      }),
      type: VideoMessageType.GET_RECORDING_STATE,
    })
  );
  expect(tabSendMessage).toHaveBeenCalledWith(11, {
    type: VideoMessageType.HIDE_COUNTDOWN,
  });
  expect(runtimeResponse.state?.duration).toBe(42);
  expect(tabResponse.success).toBe(true);
}

async function attachesFreshnessToRuntimeMessagesAtTheBrowserBoundary() {
  const runtimeSendMessage = vi.fn(async () => createRecordingStateResponse());
  const transport = createRuntimeMessagingTransport({
    runtimeSendMessage,
    tabSendMessage: async () => ({ success: true }),
  });

  await transport.sendRuntimeMessage({ type: VideoMessageType.GET_RECORDING_STATE });

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      [RUNTIME_MESSAGE_FRESHNESS_FIELD]: expect.objectContaining({
        issuedAtEpochMs: expect.any(Number),
        nonce: expect.any(String),
      }),
      type: VideoMessageType.GET_RECORDING_STATE,
    })
  );
}

function normalizesErrorMessagesWithFallbackHandling() {
  expect(getErrorMessage(new Error('boom'))).toBe('boom');
  expect(getErrorMessage('not-an-error')).toBe('Unknown error');
  expect(getErrorMessage(null, 'custom fallback')).toBe('custom fallback');
}

describe('runtime messaging transport', () => {
  it(
    'infers and validates runtime responses by message type',
    infersAndValidatesRuntimeResponsesByMessageType
  );
  it('rejects malformed runtime responses', rejectsMalformedRuntimeResponses);
  it('rejects legacy LLM runtime response payload fields', rejectsLegacyLlmRuntimeResponsePayloads);
  it(
    'infers and validates tab responses by message type',
    infersAndValidatesTabResponsesByMessageType
  );
  it('rejects malformed tab responses', rejectsMalformedTabResponses);
  it(
    'emits trace events through the canonical transport seam instead of monkey-patching chrome',
    emitsTraceEventsThroughTheCanonicalTransportSeam
  );
  it(
    'routes root facade helpers through the default chrome transport',
    routesRootFacadeHelpersThroughTheDefaultChromeTransport
  );
  it(
    'attaches freshness to runtime messages at the browser boundary',
    attachesFreshnessToRuntimeMessagesAtTheBrowserBoundary
  );
  it(
    'normalizes error messages with fallback handling',
    normalizesErrorMessagesWithFallbackHandling
  );
});
