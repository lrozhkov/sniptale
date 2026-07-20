import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { processWithLlmMessageSchema, requestLlmSessionMessageSchema } from './llm-schemas';

const VALID_PAYLOAD_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

describe('LLM runtime schemas strict boundaries', () => {
  it('rejects unknown provider secret and debug fields on PROCESS_WITH_LLM', () => {
    expect(() =>
      processWithLlmMessageSchema.parse({
        apiKey: 'sk-live-secret',
        debug: true,
        headers: { Authorization: 'Bearer secret' },
        jsonData: '{}',
        llmSessionToken: 'session-token',
        prompt: 'Rewrite',
        rawPrompt: 'private prompt',
        type: MessageType.PROCESS_WITH_LLM,
      })
    ).toThrow();
  });

  it('rejects unknown fields on REQUEST_LLM_SESSION', () => {
    expect(() =>
      requestLlmSessionMessageSchema.parse({
        egressAuthority: {
          captureMode: 'selected_editable',
          contractVersion: 1,
          payloadHash: VALID_PAYLOAD_HASH,
          purpose: 'content-ai-pick',
          riskClass: 'safe_text',
        },
        purpose: 'content-ai-pick',
        rawPrompt: 'private prompt',
        type: MessageType.REQUEST_LLM_SESSION,
      })
    ).toThrow();
  });

  it('rejects legacy short egress digest shapes on REQUEST_LLM_SESSION', () => {
    expect(() =>
      requestLlmSessionMessageSchema.parse({
        egressAuthority: {
          captureMode: 'selected_editable',
          contractVersion: 1,
          payloadHash: 'content-hash-1',
          purpose: 'content-ai-pick',
          riskClass: 'safe_text',
        },
        purpose: 'content-ai-pick',
        type: MessageType.REQUEST_LLM_SESSION,
      })
    ).toThrow();
  });
});
