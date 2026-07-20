import { beforeEach, expect, it, vi } from 'vitest';

const scenarioRunnerMocks = vi.hoisted(() => ({
  createChromeAiSessionMock: vi.fn(),
  createChromeAiSystemPromptMessageMock: vi.fn(),
  loadChromeAiAvailabilityMock: vi.fn(),
  parseChromeAiScenarioResponseMock: vi.fn(),
  prepareChromeAiSessionMock: vi.fn(),
  requestScenarioEditorSystemPromptMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/chrome-ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/chrome-ai')>()),
  loadChromeAiAvailability: scenarioRunnerMocks.loadChromeAiAvailabilityMock,
  createChromeAiSession: scenarioRunnerMocks.createChromeAiSessionMock,
  createChromeAiSystemPromptMessage: scenarioRunnerMocks.createChromeAiSystemPromptMessageMock,
  prepareChromeAiSession: scenarioRunnerMocks.prepareChromeAiSessionMock,
}));

vi.mock('../../../../workflows/ai-settings/query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../workflows/ai-settings/query')>()),
  requestScenarioEditorSystemPrompt: scenarioRunnerMocks.requestScenarioEditorSystemPromptMock,
}));

vi.mock('./response', () => ({
  parseChromeAiScenarioResponse: scenarioRunnerMocks.parseChromeAiScenarioResponseMock,
}));

import { runChromeAiScenarioRequest } from './scenario-runner';

function createSession(promptImplementation?: (input: unknown) => Promise<string>) {
  return {
    destroy: vi.fn(),
    prompt: vi.fn().mockImplementation(promptImplementation ?? (async () => '{"steps":[]}')),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  scenarioRunnerMocks.requestScenarioEditorSystemPromptMock.mockResolvedValue(
    'Scenario system prompt'
  );
  scenarioRunnerMocks.createChromeAiSystemPromptMessageMock.mockImplementation((prompt) => [
    { role: 'system', content: prompt },
  ]);
  scenarioRunnerMocks.parseChromeAiScenarioResponseMock.mockImplementation((value) => ({
    cleanedResponse: value,
    operations: [],
    rawResponse: value,
    success: true,
  }));
});

it('rejects oversized attachment payloads before creating a Chrome AI session', async () => {
  await expect(
    runChromeAiScenarioRequest({
      attachments: [
        {
          dataUrl: `data:image/png;base64,${'a'.repeat(9_333_336)}`,
          filename: 'shot.png',
          mimeType: 'image/png',
          stepId: 'step-1',
          stepNumber: 1,
        },
      ],
      contractVersion: 3,
      instruction: 'Rewrite the scenario',
      projectSnapshotJson: '{"steps":[]}',
    })
  ).rejects.toThrow('attachments[].dataUrl exceeds 7000000 decoded bytes');

  expect(scenarioRunnerMocks.createChromeAiSessionMock).not.toHaveBeenCalled();
});

it('builds multimodal prompt parts for attachments and parses the shared response', async () => {
  const session = createSession();
  scenarioRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  const result = await runChromeAiScenarioRequest({
    attachments: [
      {
        dataUrl: 'data:image/png;base64,AA==',
        filename: 'shot.png',
        mimeType: 'image/png',
        stepId: 'step-1',
        stepNumber: 1,
      },
    ],
    contractVersion: 3,
    instruction: 'Rewrite the scenario',
    projectSnapshotJson: '{"steps":[]}',
  });

  expect(result).toMatchObject({ success: true });
  expect(session.prompt).toHaveBeenCalledWith([
    {
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'text',
          value: expect.stringContaining('Rewrite the scenario'),
        }),
        expect.objectContaining({
          type: 'image',
          value: expect.objectContaining({ type: 'image/png' }),
        }),
      ],
    },
  ]);
  expect(session.destroy).toHaveBeenCalledTimes(1);
});

it('redacts sensitive scenario text before Chrome AI prompt egress', async () => {
  const session = createSession();
  scenarioRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await runChromeAiScenarioRequest({
    attachments: [],
    contractVersion: 3,
    instruction: 'Use Authorization: ApiKey chrome-secret',
    projectSnapshotJson: '{"sessionId":"session-secret","safe":"Display name"}',
  });

  const prompt = session.prompt.mock.calls[0]?.[0] as Array<{
    content: Array<{ type: string; value?: string }>;
  }>;
  const text = prompt[0]?.content.find((part) => part.type === 'text')?.value ?? '';
  expect(text).not.toContain('chrome-secret');
  expect(text).not.toContain('session-secret');
  expect(text).toContain('Display name');
});

it('builds v3 operation prompt context without image attachments', async () => {
  const session = createSession(async () => '{"operations":[]}');
  scenarioRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await runChromeAiScenarioRequest({
    attachments: [],
    contractVersion: 3,
    instruction: 'Update selected slide',
    projectOutlineJson: '{"slides":[]}',
    projectSnapshotJson: '{"outline":{"version":3}}',
    selectedSlideCodeJson: '{"id":"slide-1"}',
    toolManifestJson: '{"operations":["setSlideTitle"]}',
  });

  expect(session.prompt).toHaveBeenCalledWith([
    {
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'text',
          value: expect.stringContaining('Return ONLY strict JSON with the shape {"operations"'),
        }),
      ],
    },
  ]);
  expect(scenarioRunnerMocks.parseChromeAiScenarioResponseMock).toHaveBeenCalledWith(
    '{"operations":[]}',
    3
  );
});

it('redacts sensitive v3 prompt sections before Chrome AI prompt egress', async () => {
  const session = createSession(async () => '{"operations":[]}');
  scenarioRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await runChromeAiScenarioRequest({
    attachments: [],
    contractVersion: 3,
    instruction: 'Use Authorization: ApiKey chrome-v3-secret',
    projectOutlineJson: '{"csrf":"csrf-secret"}',
    projectSnapshotJson: '{"sessionId":"session-secret","safe":"Display name"}',
    selectedSlideCodeJson: '{"apiKey":"api-secret"}',
    toolManifestJson: '{"token":"tool-secret"}',
  });

  const prompt = session.prompt.mock.calls[0]?.[0] as Array<{
    content: Array<{ type: string; value?: string }>;
  }>;
  const text = prompt[0]?.content.find((part) => part.type === 'text')?.value ?? '';
  expect(text).not.toContain('chrome-v3-secret');
  expect(text).not.toContain('csrf-secret');
  expect(text).not.toContain('session-secret');
  expect(text).not.toContain('api-secret');
  expect(text).not.toContain('tool-secret');
  expect(text).toContain('Display name');
});

it('uses empty v3 prompt sections when optional context is unavailable', async () => {
  const session = createSession(async () => '{"operations":[]}');
  scenarioRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await runChromeAiScenarioRequest({
    attachments: [],
    contractVersion: 3,
    instruction: 'Update selected slide',
    projectSnapshotJson: '{"outline":{"version":3}}',
  });

  expect(session.prompt).toHaveBeenCalledWith([
    {
      role: 'user',
      content: [
        expect.objectContaining({
          type: 'text',
          value: expect.stringContaining('Selected slide code JSON:\n{}'),
        }),
      ],
    },
  ]);
});

it('rejects attachment data URLs without an explicit matching raster MIME type', async () => {
  const session = createSession(async () => {
    throw new Error('scenario failed');
  });
  scenarioRunnerMocks.createChromeAiSessionMock.mockResolvedValue(session);

  await expect(
    runChromeAiScenarioRequest({
      attachments: [
        {
          dataUrl: 'data:;base64,AA==',
          filename: 'shot.jpg',
          mimeType: 'image/jpeg',
          stepId: 'step-2',
          stepNumber: 2,
        },
      ],
      contractVersion: 3,
      instruction: 'Rewrite the scenario',
      projectSnapshotJson: '{"steps":[]}',
    })
  ).rejects.toThrow('attachments[].dataUrl must be a raster image data URL');

  expect(scenarioRunnerMocks.createChromeAiSessionMock).not.toHaveBeenCalled();
  expect(session.prompt).not.toHaveBeenCalled();
});
