import { expect, it } from 'vitest';

import { createAiPrivacyProof } from '../privacy';
import {
  canonicalizeScenarioEditorEgressPayload,
  createContentAiEgressAuthority,
  createScenarioEditorEgressAuthority,
} from './index';

it('binds content AI authority to the privacy proof payload hash', async () => {
  const payload = { jsonData: '{"fields":[]}' };
  const privacyProof = await createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });

  await expect(createContentAiEgressAuthority({ payload, privacyProof })).resolves.toMatchObject({
    payloadHash: privacyProof.payloadHash,
    purpose: 'content-ai-pick',
  });
  await expect(
    createContentAiEgressAuthority({
      payload: { jsonData: '{"fields":[{"id":"changed"}]}' },
      privacyProof,
    })
  ).rejects.toThrow('AI privacy proof payload binding mismatch');
});

it('canonicalizes scenario JSON and strips URL credentials, query, and hash fields', () => {
  const canonical = canonicalizeScenarioEditorEgressPayload({
    attachments: [],
    contractVersion: 3,
    projectSnapshotJson:
      '{"steps":[{"page":{"url":"https://user:pass@example.test/path?token=secret#hash"}}]}',
  });

  expect(canonical.projectSnapshotJson).toBe(
    '{"steps":[{"page":{"url":"https://example.test/path"}}]}'
  );
});

it('changes scenario authority when attachment payloads are mutated', async () => {
  const base = {
    attachments: [
      {
        dataUrl: 'data:image/png;base64,AA==',
        filename: 'step-1.png',
        mimeType: 'image/png',
        stepId: 'step-1',
        stepNumber: 1,
      },
    ],
    contractVersion: 3 as const,
    projectSnapshotJson: '{"steps":[]}',
  };

  const baseAuthority = await createScenarioEditorEgressAuthority(base);
  const changedAuthority = await createScenarioEditorEgressAuthority({
    ...base,
    attachments: [{ ...base.attachments[0]!, dataUrl: 'data:image/png;base64,AQ==' }],
  });

  expect(baseAuthority.payloadHash).not.toBe(changedAuthority.payloadHash);
});
