import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedLlmModelConfig } from './model-config';
import { createAiPrivacyProof, type LlmPrivacyPayload } from '../../../features/ai/privacy';

const { loggerDebugMock, processWithLLMConfigMock, processWithLLMMock } = vi.hoisted(() => ({
  loggerDebugMock: vi.fn(),
  processWithLLMConfigMock: vi.fn(),
  processWithLLMMock: vi.fn(),
}));

const VALID_AI_PICK_RESPONSE = JSON.stringify({
  i: 'update',
  f: [{ id: 'node-4', n: 'Name', c: 'Old', new: 'Normalized node' }],
  t: [],
});

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    child: vi.fn(),
    debug: loggerDebugMock,
    error: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('./service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./service')>()),
  processWithLLM: processWithLLMMock,
  processWithLLMConfig: processWithLLMConfigMock,
}));

import { processMultiProviderRequest } from './router-processing';

function createConfig(): ResolvedLlmModelConfig {
  return {
    providerId: 'provider-1',
    modelId: 'model-1',
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: 'secret-key',
    modelCode: 'llama3.2',
    effectiveSystemPrompt: 'Return valid JSON only',
  };
}

async function withPrivacyProof<T extends LlmPrivacyPayload>(
  payload: T
): Promise<T & { privacyProof: Awaited<ReturnType<typeof createAiPrivacyProof>> }> {
  return {
    ...payload,
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
  };
}

function resetLlmRouterProcessingMocks() {
  vi.clearAllMocks();
  processWithLLMMock.mockResolvedValue({
    cleanedResponse: '| cleaned |',
    data: [{ id: 'node-3', text: 'Updated node' }],
  });
  processWithLLMConfigMock.mockResolvedValue({
    cleanedResponse: VALID_AI_PICK_RESPONSE,
    data: [{ id: 'node-4', text: 'Normalized node' }],
  });
}

async function verifyJsonBranch() {
  const config = createConfig();

  await expect(
    processMultiProviderRequest(
      await withPrivacyProof({
        prompt: 'Normalize JSON',
        jsonData: '{"fields":[]}',
      }),
      config
    )
  ).resolves.toEqual({
    success: true,
    changes: [
      {
        type: 'field',
        fieldId: 'node-4',
        fieldName: 'Name',
        newValue: 'Normalized node',
      },
    ],
    data: [{ id: 'node-4', text: 'Normalized node' }],
    parseErrors: [],
  });

  expect(processWithLLMConfigMock).toHaveBeenCalledWith(
    { prompt: 'Normalize JSON', jsonData: '{"fields":[]}' },
    config,
    3
  );
  expect(loggerDebugMock).toHaveBeenCalledWith('Processing provider-backed LLM request', {
    hasJsonData: true,
    hasMarkdownData: false,
    modelCode: 'llama3.2',
    providerId: 'provider-1',
    riskClass: 'safe_text',
  });
  expect(processWithLLMMock).not.toHaveBeenCalled();
}

async function verifyJsonBranchRedactsFinalProviderPayload() {
  const config = createConfig();

  await processMultiProviderRequest(
    await withPrivacyProof({
      prompt: 'Use Authorization: Bearer prompt-secret',
      jsonData: '{"password":"json-secret","visible":"display"}',
    }),
    config
  );

  const [request] = processWithLLMConfigMock.mock.calls[0] ?? [];
  const providerText = JSON.stringify(request);
  expect(providerText).not.toContain('prompt-secret');
  expect(providerText).not.toContain('json-secret');
  expect(providerText).toContain('display');
}

async function verifyMarkdownBranch() {
  const config = createConfig();

  await expect(
    processMultiProviderRequest(
      await withPrivacyProof({
        prompt: 'Summarize markdown',
        markdownData: '| a |\n| - |',
      }),
      config
    )
  ).resolves.toEqual({
    success: true,
    data: [{ id: 'node-3', text: 'Updated node' }],
  });

  expect(processWithLLMMock).toHaveBeenCalledWith(
    { prompt: 'Summarize markdown', markdownData: '| a |\n| - |' },
    config
  );
}

async function verifyMarkdownBranchRedactsFinalProviderPayload() {
  const config = createConfig();

  await processMultiProviderRequest(
    await withPrivacyProof({
      prompt: 'Use Authorization: Bearer prompt-secret',
      markdownData: '| Password | Notes |\n| --- | --- |\n| markdown-secret | visible |',
    }),
    config
  );

  const [request] = processWithLLMMock.mock.calls[0] ?? [];
  const providerText = JSON.stringify(request);
  expect(providerText).not.toContain('prompt-secret');
  expect(providerText).not.toContain('markdown-secret');
  expect(providerText).toContain('visible');
}

async function verifyMissingPayloadFailure() {
  await expect(
    processMultiProviderRequest(
      {
        prompt: 'Normalize legacy data',
      },
      createConfig()
    )
  ).rejects.toThrow('AI request is missing page-derived payload');
}

async function verifySuccessResultOmitsUndefinedOptionalFields() {
  const config = createConfig();
  processWithLLMConfigMock.mockResolvedValueOnce({
    cleanedResponse: undefined,
    data: undefined,
  });

  await expect(
    processMultiProviderRequest(
      await withPrivacyProof({
        prompt: 'Normalize JSON',
        jsonData: '{"fields":[]}',
      }),
      config
    )
  ).resolves.toEqual({
    success: true,
  });
}

describe('router-processing', () => {
  beforeEach(resetLlmRouterProcessingMocks);

  it(
    'routes json payloads through processWithLLMConfig with the canonical retry count',
    verifyJsonBranch
  );
  it(
    'redacts json payloads and prompts before provider delegation',
    verifyJsonBranchRedactsFinalProviderPayload
  );
  it('routes markdown payloads through processWithLLM', verifyMarkdownBranch);
  it(
    'redacts markdown payloads and prompts before provider delegation',
    verifyMarkdownBranchRedactsFinalProviderPayload
  );
  it(
    'omits undefined optional fields from successful provider-backed results',
    verifySuccessResultOmitsUndefinedOptionalFields
  );
  it('throws when no supported payload shape is provided', verifyMissingPayloadFailure);
});
