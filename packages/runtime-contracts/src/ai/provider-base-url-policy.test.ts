import { describe, expect, it } from 'vitest';

import {
  isAllowedAIProviderBaseUrl,
  resolveAIProviderBaseUrlPolicy,
  resolveAIProviderCanonicalOrigin,
  resolveAIProviderChatCompletionsUrl,
} from './provider-base-url-policy';

describe('AI provider base URL policy', () => {
  it('allows HTTPS provider URLs and loopback HTTP URLs', () => {
    expect(isAllowedAIProviderBaseUrl('https://api.example.com/v1')).toBe(true);
    expect(isAllowedAIProviderBaseUrl('https://api.openai.com/v1')).toBe(true);
    expect(isAllowedAIProviderBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isAllowedAIProviderBaseUrl('http://preview.localhost:11434/v1')).toBe(true);
    expect(isAllowedAIProviderBaseUrl('http://127.0.0.1:11434/v1')).toBe(true);
  });

  it('rejects disallowed provider URL shapes with stable policy reasons', () => {
    expect(resolveAIProviderBaseUrlPolicy('https://user:pass@example.com/v1')).toBe(
      'embedded-credentials-not-allowed'
    );
    expect(resolveAIProviderBaseUrlPolicy('http://example.com/v1')).toBe('https-required');
    expect(resolveAIProviderBaseUrlPolicy('not-a-url')).toBe('invalid-url');
    expect(resolveAIProviderBaseUrlPolicy('https://api.example.com/v1?token=secret')).toBe(
      'query-or-fragment-not-allowed'
    );
    expect(resolveAIProviderBaseUrlPolicy('https://api.example.com/v1#models')).toBe(
      'query-or-fragment-not-allowed'
    );
  });

  it('resolves canonical origins only for allowed provider URLs', () => {
    expect(resolveAIProviderCanonicalOrigin('https://api.example.com/v1')).toBe(
      'https://api.example.com'
    );
    expect(resolveAIProviderCanonicalOrigin('http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434'
    );
    expect(resolveAIProviderCanonicalOrigin('https://user:pass@example.com/v1')).toBeNull();
  });

  it('builds chat completions URLs only after applying the same policy', () => {
    expect(resolveAIProviderChatCompletionsUrl('https://api.example.com/v1/')).toBe(
      'https://api.example.com/v1/chat/completions'
    );
    expect(resolveAIProviderChatCompletionsUrl('http://127.0.0.1:11434/v1')).toBe(
      'http://127.0.0.1:11434/v1/chat/completions'
    );
    expect(resolveAIProviderChatCompletionsUrl('http://api.example.com/v1')).toBeNull();
    expect(resolveAIProviderChatCompletionsUrl('https://user:pass@example.com/v1')).toBeNull();
    expect(
      resolveAIProviderChatCompletionsUrl('https://api.example.com/v1?token=secret')
    ).toBeNull();
    expect(resolveAIProviderChatCompletionsUrl('not-a-url')).toBeNull();
  });
});
