import { describe, expect, it, vi } from 'vitest';

import {
  createAiPayloadHash,
  createAiPrivacyProof,
  normalizeLlmPayloadForProvider,
  sanitizeDomNodeForLlm,
} from './index';

describe('AI DOM privacy sanitizer', () => {
  it('strips sensitive DOM nodes before LLM provider payloads', () => {
    expect(
      sanitizeDomNodeForLlm({
        id: 'password-field',
        selector: 'input[type=password]',
        text: 'secret',
      })
    ).toBeNull();
  });

  it('redacts token-like text and binds proof to the exact payload', async () => {
    const payload = {
      jsonData: JSON.stringify({
        f: [{ id: 'field-1', n: 'Name', c: 'Bearer abcdefghijklmnop', new: '' }],
        i: 'Edit',
        t: [],
      }),
    };
    const proof = await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    });

    const normalized = await normalizeLlmPayloadForProvider({ payload, privacyProof: proof });

    expect(normalized.jsonData).toContain('Bearer ***');
    await expect(
      normalizeLlmPayloadForProvider({
        payload: { jsonData: '{"changed":true}' },
        privacyProof: proof,
      })
    ).rejects.toThrow('payload binding mismatch');
  });
});

describe('AI DOM privacy proof policy', () => {
  it('blocks form text unless the capture mode explicitly allows it', async () => {
    const payload = {
      data: [{ id: 'input-field', selector: '#customer-name', text: 'Alice' }],
    };
    const proof = await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      riskClass: 'form_text',
      userInitiatedAiExtraction: true,
    });

    await expect(normalizeLlmPayloadForProvider({ payload, privacyProof: proof })).rejects.toThrow(
      'Form text requires explicit AI extraction mode'
    );
  });

  it('rejects stale or non-user-initiated proofs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
    const payload = { markdownData: 'safe text' };
    const proof = await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload,
      userInitiatedAiExtraction: false,
    });

    await expect(normalizeLlmPayloadForProvider({ payload, privacyProof: proof })).rejects.toThrow(
      'explicit user initiated extraction'
    );

    await expect(
      normalizeLlmPayloadForProvider({
        payload,
        privacyProof: {
          ...proof,
          payloadHash: await createAiPayloadHash(payload),
          userInitiatedAiExtraction: true,
        },
        nowEpochMs: Date.now() + 3 * 60 * 1000,
      })
    ).rejects.toThrow('stale');
    vi.useRealTimers();
  });
});
