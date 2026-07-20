import { beforeEach, expect, it, vi } from 'vitest';

const contentRunnerMocks = vi.hoisted(() => ({
  createChromeAiSessionMock: vi.fn(),
  createChromeAiSystemPromptMessageMock: vi.fn(),
  loadChromeAiAvailabilityMock: vi.fn(),
  prepareChromeAiSessionMock: vi.fn(),
  requestChromeAiContentSystemPromptMock: vi.fn(),
  validateChromeAiJsonResponseMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/chrome-ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/chrome-ai')>()),
  loadChromeAiAvailability: contentRunnerMocks.loadChromeAiAvailabilityMock,
  createChromeAiSession: contentRunnerMocks.createChromeAiSessionMock,
  createChromeAiSystemPromptMessage: contentRunnerMocks.createChromeAiSystemPromptMessageMock,
  prepareChromeAiSession: contentRunnerMocks.prepareChromeAiSessionMock,
}));

vi.mock('../../../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../../workflows/ai-settings/query')>()),
  requestChromeAiContentSystemPrompt: contentRunnerMocks.requestChromeAiContentSystemPromptMock,
}));

vi.mock('./response', () => ({
  validateChromeAiJsonResponse: contentRunnerMocks.validateChromeAiJsonResponseMock,
}));

import { runChromeAiContentJsonRequest } from './content-runner';
import { createAiPrivacyProof } from '../../../../../../features/ai/privacy';

const MISMATCH_PAYLOAD_HASH =
  'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function createSession(promptImplementation?: (input: string) => Promise<string>) {
  return {
    destroy: vi.fn(),
    prompt: vi.fn().mockImplementation(promptImplementation ?? (async () => '{"validated":true}')),
  };
}

function createPrivacyProof(jsonData: string) {
  return createAiPrivacyProof({
    captureMode: 'selected_editable',
    payload: { jsonData },
    riskClass: 'safe_text',
    userInitiatedAiExtraction: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  contentRunnerMocks.requestChromeAiContentSystemPromptMock.mockResolvedValue('Global prompt');
  contentRunnerMocks.createChromeAiSystemPromptMessageMock.mockImplementation((prompt) => [
    { role: 'system', content: prompt },
  ]);
  contentRunnerMocks.validateChromeAiJsonResponseMock.mockImplementation((value) => value);
});

it('rejects oversized content payloads before creating a Chrome AI session', async () => {
  await expect(
    runChromeAiContentJsonRequest({
      jsonData: '\u0800'.repeat(700_000),
      modelId: 'model-1',
      privacyProof: await createPrivacyProof('\u0800'.repeat(700_000)),
      prompt: 'Improve this JSON',
    })
  ).rejects.toThrow('jsonData exceeds 2000000 decoded bytes');

  expect(contentRunnerMocks.createChromeAiSessionMock).not.toHaveBeenCalled();
});

it('requires a fresh privacy proof before creating a Chrome AI session', async () => {
  await expect(
    runChromeAiContentJsonRequest({
      jsonData: '{"selection":1}',
      modelId: 'model-1',
      privacyProof: {
        ...(await createPrivacyProof('{"other":1}')),
        payloadHash: MISMATCH_PAYLOAD_HASH,
      },
      prompt: 'Improve this JSON',
    })
  ).rejects.toThrow('AI privacy proof payload binding mismatch');

  expect(contentRunnerMocks.createChromeAiSessionMock).not.toHaveBeenCalled();
});

it('rejects empty normalized Chrome AI JSON before creating a session', async () => {
  await expect(
    runChromeAiContentJsonRequest({
      jsonData: '',
      modelId: 'model-1',
      privacyProof: await createPrivacyProof(''),
      prompt: 'Improve this JSON',
    })
  ).rejects.toThrow('Chrome AI payload was removed by privacy normalization');

  expect(contentRunnerMocks.createChromeAiSessionMock).not.toHaveBeenCalled();
});

it('prefers a model-specific system prompt and validates the response payload', async () => {
  const jsonData = '{"selection":1}';
  const session = createSession();
  contentRunnerMocks.requestChromeAiContentSystemPromptMock.mockResolvedValue('Model prompt');
  contentRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await expect(
    runChromeAiContentJsonRequest({
      jsonData,
      modelId: 'model-1',
      privacyProof: await createPrivacyProof(jsonData),
      prompt: 'Improve this JSON',
    })
  ).resolves.toBe('{"validated":true}');

  expect(contentRunnerMocks.createChromeAiSystemPromptMessageMock).toHaveBeenCalledWith(
    'Model prompt'
  );
  expect(contentRunnerMocks.requestChromeAiContentSystemPromptMock).toHaveBeenCalledWith('model-1');
  expect(session.prompt).toHaveBeenCalledWith(
    expect.stringContaining('### Instruction:\nImprove this JSON')
  );
  expect(contentRunnerMocks.validateChromeAiJsonResponseMock).toHaveBeenCalledWith(
    '{"validated":true}'
  );
  expect(session.destroy).toHaveBeenCalledTimes(1);
});

it('redacts secret-like prompt text before Chrome AI egress', async () => {
  const jsonData = '{"selection":"public"}';
  const session = createSession();
  contentRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await runChromeAiContentJsonRequest({
    jsonData,
    modelId: 'model-1',
    privacyProof: await createPrivacyProof(jsonData),
    prompt: 'Summarize this. Authorization: Bearer raw-secret-token',
  });

  const finalPrompt = session.prompt.mock.calls[0]?.[0] ?? '';
  expect(finalPrompt).toContain('"selection":"public"');
  expect(finalPrompt).toContain('Summarize this.');
  expect(finalPrompt).not.toContain('raw-secret-token');
  expect(finalPrompt).toContain('Authorization: ***');
});

it('falls back to the global prompt and still destroys the session on prompt failure', async () => {
  const jsonData = '{"selection":1}';
  const session = createSession(async () => {
    throw new Error('prompt failed');
  });
  contentRunnerMocks.requestChromeAiContentSystemPromptMock.mockResolvedValue('Global prompt');
  contentRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await expect(
    runChromeAiContentJsonRequest({
      jsonData,
      modelId: 'model-1',
      privacyProof: await createPrivacyProof(jsonData),
      prompt: 'Improve this JSON',
    })
  ).rejects.toThrow('prompt failed');

  expect(contentRunnerMocks.createChromeAiSystemPromptMessageMock).toHaveBeenCalledWith(
    'Global prompt'
  );
  expect(session.destroy).toHaveBeenCalledTimes(1);
});
