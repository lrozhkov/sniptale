import { expect, it } from 'vitest';

import { AI_EGRESS_AUTHORITY_CONTRACT_VERSION, aiEgressAuthoritySchema } from './egress-authority';

const VALID_PAYLOAD_HASH =
  'sha256:1111111111111111111111111111111111111111111111111111111111111111';

it('validates content AI egress authority contracts without importing the AI owner', () => {
  expect(
    aiEgressAuthoritySchema.parse({
      captureMode: 'selected_editable',
      contractVersion: AI_EGRESS_AUTHORITY_CONTRACT_VERSION,
      payloadHash: VALID_PAYLOAD_HASH,
      purpose: 'content-ai-pick',
      riskClass: 'safe_text',
    })
  ).toMatchObject({ purpose: 'content-ai-pick' });
});

it('rejects malformed scenario AI egress authority summaries', () => {
  expect(() =>
    aiEgressAuthoritySchema.parse({
      attachmentSummary: {
        count: 1,
        items: [{ dataUrlHash: 'not-a-digest', dataUrlLength: -1, stepNumber: 0 }],
        totalDataUrlLength: -1,
      },
      contractVersion: AI_EGRESS_AUTHORITY_CONTRACT_VERSION,
      payloadHash: VALID_PAYLOAD_HASH,
      purpose: 'scenario-editor',
      scenarioContractVersion: 3,
    })
  ).toThrow();
});
