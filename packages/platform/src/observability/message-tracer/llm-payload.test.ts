import { describe, expect, it } from 'vitest';

import { sanitizeLlmTracePayload } from './llm-payload';

describe('message tracer LLM payload sanitizer passthroughs', () => {
  it('returns non-LLM payloads unchanged', () => {
    const payload = { text: 'visible non-LLM text' };

    expect(sanitizeLlmTracePayload('CAPTURE_PAGE', payload)).toBe(payload);
  });

  it('summarizes primitive LLM payloads', () => {
    expect(sanitizeLlmTracePayload('PROCESS_WITH_LLM', 'private prompt')).toEqual({
      payloadSummaryLength: 14,
    });
    expect(sanitizeLlmTracePayload('PROCESS_WITH_LLM', null)).toEqual({
      payloadSummaryPresent: false,
    });
    expect(sanitizeLlmTracePayload('PROCESS_WITH_LLM', ['a', 'b'])).toEqual({
      payloadSummaryCount: 2,
    });
  });
});

describe('message tracer LLM request payload sanitizer summaries', () => {
  it('summarizes LLM request payloads without retaining prompt data or session tokens', () => {
    const sanitized = sanitizeLlmTracePayload('PROCESS_WITH_LLM', {
      type: 'PROCESS_WITH_LLM',
      llmSessionToken: 'session-token-secret',
      prompt: 'Summarize private page',
      jsonData: '{"secret":"page data"}',
      modelId: 'model-1',
    });

    expect(sanitized).toEqual({
      type: 'PROCESS_WITH_LLM',
      llmSessionTokenSummaryLength: 20,
      promptSummaryLength: 22,
      jsonDataSummaryLength: 22,
      modelId: 'model-1',
    });
    expect(JSON.stringify(sanitized)).not.toContain('private page');
    expect(JSON.stringify(sanitized)).not.toContain('session-token-secret');
  });
});

describe('message tracer LLM response payload sanitizer summaries', () => {
  it('summarizes LLM response payloads without retaining raw model output', () => {
    const sanitized = sanitizeLlmTracePayload('PROCESS_WITH_LLM_RESPONSE', {
      success: false,
      error: 'Authorization: Bearer sk-secret',
      rawResponse: 'raw private model response',
      cleanedResponse: '{"private":true}',
    });

    expect(sanitized).toEqual({
      success: false,
      error: 'Authorization: ***',
      rawResponseSummaryLength: 26,
      cleanedResponseSummaryLength: 16,
    });
    expect(JSON.stringify(sanitized)).not.toContain('sk-secret');
    expect(JSON.stringify(sanitized)).not.toContain('private model');
  });

  it('omits parse failure details that may contain model output snippets', () => {
    const sanitized = sanitizeLlmTracePayload('PROCESS_SCENARIO_EDITOR_WITH_LLM_RESPONSE', {
      success: false,
      error: 'Unable to parse model response',
      parseError: 'token=secret page text',
    });

    expect(sanitized).toEqual({
      success: false,
      error: 'Unable to parse model response',
    });
    expect(JSON.stringify(sanitized)).not.toContain('token=secret');
    expect(JSON.stringify(sanitized)).not.toContain('page text');
  });
});
