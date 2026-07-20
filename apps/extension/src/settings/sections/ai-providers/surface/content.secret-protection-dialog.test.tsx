// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { AIModel, AIProvider } from '../../../../contracts/settings';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersSectionContent } from './content';
import { createMockChromeAiState, createMockSecretProtectionState } from './test-support';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: false,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: '',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createPromptState() {
  return {
    isSaving: false,
    saveError: null,
    value: '',
    textareaRef: { current: null },
    setValue: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(undefined),
    handleResizeStart: vi.fn(),
  };
}

function createState(): AiProvidersSectionState {
  return {
    chromeAi: createMockChromeAiState(),
    secretProtection: {
      ...createMockSecretProtectionState(),
      dialog: { mode: 'unlock', error: null, isSubmitting: false },
      status: { isEnabled: true, isUnlocked: false, mode: 'passphrase' },
    },
    providers: [PROVIDER],
    models: [MODEL],
    defaultModelId: 'model-1',
    isLoading: false,
    modelOptions: [],
    prompts: { global: createPromptState(), scenarioEditor: createPromptState() },
    modals: {
      provider: { open: true, provider: PROVIDER },
      model: { open: false },
      confirmDelete: null,
      openProviderModal: vi.fn(),
      closeProviderModal: vi.fn(),
      openModelModal: vi.fn(),
      closeModelModal: vi.fn(),
      setConfirmDelete: vi.fn(),
    },
    handleDefaultModelChange: vi.fn().mockResolvedValue(undefined),
    handleClearProviderSecret: vi.fn().mockResolvedValue(undefined),
    handleDeleteProvider: vi.fn().mockResolvedValue(undefined),
    handleDeleteModel: vi.fn().mockResolvedValue(undefined),
    reloadData: vi.fn().mockResolvedValue(undefined),
    getProviderName: vi.fn(() => 'OpenAI'),
  };
}

async function renderUi() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<AIProvidersSectionContent state={createState()} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('renders the passphrase unlock dialog after the provider modal root', async () => {
  await renderUi();

  const markup = container?.innerHTML ?? '';
  expect(markup.indexOf(translate('settings.aiProviders.providerModalEditTitle'))).toBeLessThan(
    markup.indexOf(translate('settings.aiProviders.secretProtectionUnlockTitle'))
  );
});
