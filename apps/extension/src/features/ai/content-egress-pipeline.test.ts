import { expect, it } from 'vitest';

import { createAiPrivacyProof, type LlmPrivacyPayload } from './privacy';
import {
  CONTENT_AI_EGRESS_PIPELINE_STAGES,
  SCENARIO_EDITOR_AI_EGRESS_PIPELINE_STAGES,
  SCENARIO_EDITOR_AI_PIPELINE_DIVERGENCE,
  prepareChromeContentAiJsonEgress,
  prepareProviderContentAiEgress,
} from './content-egress-pipeline';

const MISMATCH_PAYLOAD_HASH =
  'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function createProof(payload: LlmPrivacyPayload) {
  return createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload,
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
}

it('keeps privacy proof and redaction before content AI transport egress', () => {
  expect(CONTENT_AI_EGRESS_PIPELINE_STAGES).toEqual([
    'ingress-contract',
    'session-authorization',
    'egress-lease-binding',
    'payload-limits',
    'privacy-proof-verification',
    'privacy-normalization',
    'prompt-redaction',
    'transport-adapter',
    'response-parser',
  ]);
  expect(CONTENT_AI_EGRESS_PIPELINE_STAGES.indexOf('privacy-proof-verification')).toBeLessThan(
    CONTENT_AI_EGRESS_PIPELINE_STAGES.indexOf('transport-adapter')
  );
  expect(CONTENT_AI_EGRESS_PIPELINE_STAGES.indexOf('prompt-redaction')).toBeLessThan(
    CONTENT_AI_EGRESS_PIPELINE_STAGES.indexOf('transport-adapter')
  );
});

it('prepares provider-backed content AI egress with normalized and redacted payloads', async () => {
  const prepared = await prepareProviderContentAiEgress({
    jsonData: '{"password":"json-secret","visible":"display"}',
    privacyProof: await createProof({
      jsonData: '{"password":"json-secret","visible":"display"}',
    }),
    prompt: 'Use Authorization: Bearer prompt-secret',
  });

  expect(prepared).toMatchObject({ payloadKind: 'json', riskClass: 'safe_text' });
  expect(JSON.stringify(prepared.request)).not.toContain('prompt-secret');
  expect(JSON.stringify(prepared.request)).not.toContain('json-secret');
  expect(prepared.request).toEqual({
    jsonData: '{"password":"[redacted]","visible":"display"}',
    prompt: 'Use Authorization: ***',
  });
});

it('rejects provider egress when the privacy proof is missing or stale for the payload', async () => {
  await expect(
    prepareProviderContentAiEgress({
      jsonData: '{"visible":"display"}',
      prompt: 'Normalize',
    })
  ).rejects.toThrow('AI privacy proof is required');

  await expect(
    prepareProviderContentAiEgress({
      jsonData: '{"visible":"display"}',
      privacyProof: {
        ...(await createProof({ jsonData: '{"other":"display"}' })),
        payloadHash: MISMATCH_PAYLOAD_HASH,
      },
      prompt: 'Normalize',
    })
  ).rejects.toThrow('AI privacy proof payload binding mismatch');
});

it('prepares Chrome content AI egress through the same content privacy gate', async () => {
  const prepared = await prepareChromeContentAiJsonEgress({
    jsonData: '{"token":"chrome-secret","visible":"display"}',
    privacyProof: await createProof({
      jsonData: '{"token":"chrome-secret","visible":"display"}',
    }),
    prompt: 'Use Authorization: Bearer chrome-prompt-secret',
  });

  expect(prepared).toEqual({
    jsonData: '{"token":"[redacted]","visible":"display"}',
    prompt: 'Use Authorization: ***',
    riskClass: 'safe_text',
  });
});

it('documents scenario/editor AI as a redacted project-data pipeline, not DOM extraction', () => {
  expect(SCENARIO_EDITOR_AI_EGRESS_PIPELINE_STAGES).toEqual([
    'ingress-contract',
    'session-authorization',
    'egress-lease-binding',
    'payload-limits',
    'scenario-text-redaction',
    'transport-adapter',
    'response-parser',
  ]);
  expect(SCENARIO_EDITOR_AI_PIPELINE_DIVERGENCE.requiredGuards).toEqual([
    'egress-lease-binding',
    'payload-limits',
    'scenario-text-redaction',
    'response-parser',
  ]);
  expect(SCENARIO_EDITOR_AI_PIPELINE_DIVERGENCE.acceptedReason).toContain(
    'not content DOM extraction'
  );
});
