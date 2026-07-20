import { describe, expect, it } from 'vitest';

import { sanitizeLlmInput } from './ai-payload-input';

describe('AI payload input privacy', () => {
  it('sanitizes current LLM text payloads before provider egress', () => {
    const sanitized = sanitizeLlmInput({
      jsonData: '{"password":"json-secret","visible":"Visible node"}',
      prompt: 'Use Authorization: Bearer prompt-secret',
    });

    expect(sanitized).toEqual({
      jsonData: '{"password":"[redacted]","visible":"Visible node"}',
      prompt: 'Use Authorization: ***',
    });
    expect(JSON.stringify(sanitized)).not.toContain('prompt-secret');
    expect(JSON.stringify(sanitized)).not.toContain('json-secret');
  });
});
