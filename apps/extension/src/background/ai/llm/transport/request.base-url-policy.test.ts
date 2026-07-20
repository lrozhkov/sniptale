import { translate } from '../../../../platform/i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

function resetLlmTransportBaseUrlPolicyMocks() {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
}

async function verifyInvalidBaseUrlIsRejectedBeforeFetch(baseUrl: string) {
  const { requestChatCompletion } = await import('./request');

  await expect(
    requestChatCompletion({
      apiKey: 'secret-key',
      baseUrl,
      modelCode: 'llama3.2',
      systemPrompt: 'Return JSON',
      userPrompt: 'Summarize this page',
    })
  ).rejects.toThrow(translate('background.runtime.llmProviderBaseUrlHttpsRequired'));

  expect(fetchMock).not.toHaveBeenCalled();
}

describe('transport/request provider base URL policy', () => {
  beforeEach(resetLlmTransportBaseUrlPolicyMocks);

  it.each([
    'http://ollama.local/v1',
    'https://user:pass@ollama.local/v1',
    'not-a-url',
    'https://ollama.local/v1?token=secret',
    'https://ollama.local/v1#models',
  ])('rejects provider base URL %s before fetch', verifyInvalidBaseUrlIsRejectedBeforeFetch);
});
