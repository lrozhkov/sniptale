import { expect, it } from 'vitest';

import { CONTENT_AI_PAYLOAD_LIMITS, SCENARIO_EDITOR_AI_PAYLOAD_LIMITS } from './payload-policy';

it('exports shared AI payload budgets for schema and egress owners', () => {
  expect(CONTENT_AI_PAYLOAD_LIMITS.maxPromptChars).toBe(16_000);
  expect(SCENARIO_EDITOR_AI_PAYLOAD_LIMITS).toMatchObject({
    allowedAttachmentMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxAttachmentCount: 20,
    maxInstructionChars: CONTENT_AI_PAYLOAD_LIMITS.maxPromptChars,
    maxJsonFieldChars: CONTENT_AI_PAYLOAD_LIMITS.maxTextFieldChars,
    maxProjectSnapshotJsonChars: CONTENT_AI_PAYLOAD_LIMITS.maxTextFieldChars * 2,
  });
});
