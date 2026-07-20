import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../../../application/runtime-services/services.test-support';

const { requestLlmSessionTokenMock, runChromeAiContentJsonRequestMock, sendRuntimeMessageMock } =
  vi.hoisted(() => ({
    requestLlmSessionTokenMock: vi.fn(),
    runChromeAiContentJsonRequestMock: vi.fn(),
    sendRuntimeMessageMock: vi.fn(),
  }));

vi.mock('../../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('../../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('../../../../../../workflows/ai-session/llm-session', () => ({
  requestLlmSessionToken: requestLlmSessionTokenMock,
}));

vi.mock('../../runtime/chrome/content-runner', () => ({
  runChromeAiContentJsonRequest: runChromeAiContentJsonRequestMock,
}));

import { requestAiResponse } from './request';
import { CHROME_AI_MODEL_ID } from '../../../../../../features/ai/chrome/constants';

beforeEach(() => {
  vi.clearAllMocks();
  installContentRuntimeMessagingMock(sendRuntimeMessageMock);
  requestLlmSessionTokenMock.mockResolvedValue('llm-session-token-1');
  runChromeAiContentJsonRequestMock.mockResolvedValue('{"i":"update","f":[],"t":[]}');
});

function createEditablePayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    f: [{ c: 'Alice', id: 'field-name', n: 'Name', new: '' }],
    i: 'Update selected fields',
    t: [],
    ...overrides,
  });
}

async function expectSuccessfulResponse() {
  sendRuntimeMessageMock.mockResolvedValue({
    changes: [],
    parseErrors: [],
    data: { ok: true },
    success: true,
  });

  await expect(
    requestAiResponse({
      jsonData: createEditablePayload(),
      modelId: 'model-1',
      prompt: 'Summarize selected fields',
    })
  ).resolves.toEqual({ changes: [], errors: [] });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      jsonData: createEditablePayload(),
      llmSessionToken: 'llm-session-token-1',
      modelId: 'model-1',
      privacyProof: expect.objectContaining({
        captureMode: 'selected_editable',
        riskClass: 'safe_text',
        userInitiatedAiExtraction: true,
      }),
      prompt: 'Summarize selected fields',
      type: 'PROCESS_WITH_LLM',
    })
  );
  expect(requestLlmSessionTokenMock).toHaveBeenCalledWith(
    'content-ai-pick',
    expect.objectContaining({
      captureMode: 'selected_editable',
      contractVersion: 1,
      purpose: 'content-ai-pick',
      riskClass: 'safe_text',
    })
  );
}

async function expectMissingResponseFailure() {
  sendRuntimeMessageMock.mockResolvedValue(null);

  await expect(
    requestAiResponse({
      jsonData: createEditablePayload(),
      prompt: 'Summarize selected fields',
    })
  ).rejects.toThrow('content.toolbar.aiNoBackgroundResponse');
}

async function expectExplicitErrorFailure() {
  sendRuntimeMessageMock.mockResolvedValue({
    error: 'runtime failed',
    success: false,
  });

  await expect(
    requestAiResponse({
      jsonData: createEditablePayload(),
      prompt: 'Summarize selected fields',
    })
  ).rejects.toThrow('runtime failed');
}

async function expectEmptyPayloadFailure() {
  sendRuntimeMessageMock.mockResolvedValue({
    success: true,
  });

  await expect(
    requestAiResponse({
      jsonData: createEditablePayload(),
      prompt: 'Summarize selected fields',
    })
  ).rejects.toThrow('content.toolbar.aiEmptyResponse');
}

async function expectChromeAiBypass() {
  runChromeAiContentJsonRequestMock.mockResolvedValue(
    JSON.stringify({
      i: 'update',
      f: [{ id: 'field-1', n: 'Name', c: 'Old', new: 'New' }],
      t: [],
    })
  );

  await expect(
    requestAiResponse({
      jsonData: createEditablePayload(),
      modelId: CHROME_AI_MODEL_ID,
      prompt: 'Summarize selected fields',
    })
  ).resolves.toEqual({
    changes: [{ fieldId: 'field-1', fieldName: 'Name', newValue: 'New', type: 'field' }],
    errors: [],
  });

  expect(runChromeAiContentJsonRequestMock).toHaveBeenCalledWith({
    jsonData: createEditablePayload(),
    modelId: CHROME_AI_MODEL_ID,
    privacyProof: expect.objectContaining({
      captureMode: 'selected_editable',
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
    prompt: 'Summarize selected fields',
  });
  expect(requestLlmSessionTokenMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
}

async function expectMalformedPayloadFailure() {
  await expect(
    requestAiResponse({
      jsonData: '{"selected":true}',
      prompt: 'Summarize selected fields',
    })
  ).rejects.toThrow('content.toolbar.aiNoData');

  expect(requestLlmSessionTokenMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(runChromeAiContentJsonRequestMock).not.toHaveBeenCalled();
}

async function expectNoAiEgressForPayload(jsonData: string, modelId?: string) {
  vi.clearAllMocks();
  requestLlmSessionTokenMock.mockResolvedValue('llm-session-token-1');

  await expect(
    requestAiResponse({
      jsonData,
      prompt: 'Summarize selected fields',
      ...(modelId === undefined ? {} : { modelId }),
    })
  ).rejects.toThrow('content.toolbar.aiNoData');

  expect(requestLlmSessionTokenMock).not.toHaveBeenCalled();
  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(runChromeAiContentJsonRequestMock).not.toHaveBeenCalled();
}

async function expectProviderFailClosedForNonEditablePayloads() {
  const cases = [
    JSON.stringify({ f: [], i: 'empty', t: [] }),
    JSON.stringify({
      f: [{ c: 'visible-secret', id: 'field-password', n: 'Password', new: '' }],
      t: [],
    }),
    JSON.stringify({ f: [{ c: 123, id: 'field-invalid', n: 'Name', new: '' }], t: [] }),
    JSON.stringify({
      f: [],
      t: [
        {
          r: [
            {
              d: { Notes: 'api_key=generic-row-secret' },
              id: 'row-1',
              new: {},
            },
          ],
          ttl: 'Secrets',
        },
      ],
    }),
  ];

  for (const jsonData of cases) {
    await expectNoAiEgressForPayload(jsonData);
  }
}

async function expectChromeAiFailClosedForNonEditablePayloads() {
  await expectNoAiEgressForPayload(
    JSON.stringify({
      f: [{ c: 'visible-secret', id: 'field-password', n: 'Password', new: '' }],
      t: [],
    }),
    CHROME_AI_MODEL_ID
  );
}

describe('ai-pick-controller-submit-request', () => {
  it('returns parsed ai edit changes on success', expectSuccessfulResponse);
  it('fails when the runtime returns no response', expectMissingResponseFailure);
  it('fails when the runtime reports an explicit error', expectExplicitErrorFailure);
  it(
    'fails when the runtime returns success without parsed response payload',
    expectEmptyPayloadFailure
  );
  it('routes chrome built-in models without requesting a background token', expectChromeAiBypass);
  it('fails closed for non-editable selected payloads', expectMalformedPayloadFailure);
  it(
    'fails closed before provider-backed egress for empty or non-editable payloads',
    expectProviderFailClosedForNonEditablePayloads
  );
  it(
    'fails closed before Chrome AI egress for empty or non-editable payloads',
    expectChromeAiFailClosedForNonEditablePayloads
  );
});
