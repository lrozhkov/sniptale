import { expect, it } from 'vitest';
import { createAiPrivacyProof } from '../../features/ai/privacy';
import {
  CONTENT_TEXT_MAX_CHARS,
  parseContentTextClientMessage,
  parseContentTextServerMessage,
} from './content-text';

const requestId = 'be0e898c-dcdf-4a0c-8e99-83949774b5ab';
async function start() {
  return {
    type: 'start',
    requestId,
    text: 'Selected words',
    prompt: 'Shorten',
    modelId: 'model',
    approvedProviderId: 'provider',
    approvedModelCode: 'code',
    approvedDestination: `sha256:${'a'.repeat(64)}`,
    llmSessionToken: 'token',
    privacyProof: await createAiPrivacyProof({
      captureMode: 'selected_editable',
      payload: { markdownData: 'Selected words' },
      riskClass: 'safe_text',
      userInitiatedAiExtraction: true,
    }),
  };
}
it('admits a plain-text request and rejects malformed or oversized boundary values', async () => {
  const request = await start();
  expect(parseContentTextClientMessage(request)).toEqual(request);
  for (const patch of [
    { text: '' },
    { text: 'x'.repeat(CONTENT_TEXT_MAX_CHARS + 1) },
    { text: 1 },
    { requestId: 'invalid' },
    { prompt: ' ' },
    { approvedDestination: 'https://changed.test' },
    { privacyProof: { ...request.privacyProof, unknown: true } },
    { html: '<p>Not admitted</p>' },
  ])
    expect(parseContentTextClientMessage({ ...request, ...patch })).toBeNull();
  expect(parseContentTextClientMessage(null)).toBeNull();
  expect(parseContentTextClientMessage({ type: 'cancel', requestId })).not.toBeNull();
  expect(parseContentTextClientMessage({ type: 'keepalive', requestId })).not.toBeNull();
});
it('returns response markup as literal text and rejects invalid terminal responses', () => {
  const literal = { type: 'result', requestId, text: '<img src=x onerror=alert(1)>' };
  expect(parseContentTextServerMessage(literal)).toEqual(literal);
  for (const value of [
    { ...literal, text: {} },
    { ...literal, text: ' ' },
    { ...literal, text: 'x'.repeat(CONTENT_TEXT_MAX_CHARS + 1) },
    { type: 'failure', requestId, code: 'raw-provider-secret-error' },
  ])
    expect(parseContentTextServerMessage(value)).toBeNull();
});

it('admits bounded provider reasons and rejects private or malformed failure evidence', () => {
  const failure = {
    type: 'failure',
    requestId: 'bde5d973-b7d7-4c61-8ec9-784bdc7a4930',
    code: 'provider-failed',
  };
  expect(parseContentTextServerMessage({ ...failure, failureReason: 'quota-exceeded' })).toEqual({
    ...failure,
    failureReason: 'quota-exceeded',
  });
  expect(parseContentTextServerMessage(failure)).toEqual(failure);
  for (const failureReason of ['PRIVATE_RESPONSE_BODY', { status: 402 }, 402])
    expect(parseContentTextServerMessage({ ...failure, failureReason })).toBeNull();
});
