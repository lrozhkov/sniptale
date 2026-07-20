import { vi } from 'vitest';
export { createSharedUiTestMock } from './shared-ui.test-support';
export { integrationTreeData } from './test-fixtures';

export function createIntegrationTemplatesState() {
  return {
    addTemplate: vi.fn(async () => undefined),
    isLoading: false,
    removeTemplate: vi.fn(async () => undefined),
    selectTemplate: vi.fn(async () => 'Template content'),
    templates: [],
    updateTemplate: vi.fn(async () => undefined),
  };
}

export function createIntegrationBootstrapPayload() {
  return {
    chromeAiEnabled: false,
    defaultModelId: 'model-1',
    globalSystemPrompt: 'Global system prompt',
    models: [
      {
        displayName: 'GPT 4.1',
        id: 'model-1',
        modelCode: 'gpt-4.1',
        providerId: 'provider-1',
        systemPrompt: '',
      },
    ],
    providers: [
      {
        baseUrl: 'https://api.openai.com/v1',
        connectionType: 'openai-compatible',
        createdAt: 1,
        hasStoredApiKey: true,
        id: 'provider-1',
        name: 'OpenAI',
      },
    ],
  };
}
