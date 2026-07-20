// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../platform/i18n';
import type { AIModel, AIProvider } from '../../../../contracts/settings';
import type { AiProvidersSectionState } from '../controller/types';
import { AIProvidersModelsCard } from './models-card';
import { AIProvidersProvidersCard } from './cards';
import { AIProvidersChromeAiCard } from './chrome-ai-card';
import { createMockChromeAiState, createMockSecretProtectionState } from './test-support';

const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: 'Prompt',
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function createState(overrides: Partial<AiProvidersSectionState> = {}): AiProvidersSectionState {
  return {
    chromeAi: createMockChromeAiState(),
    secretProtection: createMockSecretProtectionState(),
    providers: [PROVIDER],
    models: [MODEL],
    defaultModelId: 'model-1',
    isLoading: false,
    modelOptions: [],
    prompts: {
      global: {
        isSaving: false,
        saveError: null,
        value: 'Global prompt',
        textareaRef: { current: null },
        setValue: vi.fn(),
        handleSave: vi.fn().mockResolvedValue(undefined),
        handleResizeStart: vi.fn(),
      },
      scenarioEditor: {
        isSaving: false,
        saveError: null,
        value: 'Scenario prompt',
        textareaRef: { current: null },
        setValue: vi.fn(),
        handleSave: vi.fn().mockResolvedValue(undefined),
        handleResizeStart: vi.fn(),
      },
    },
    modals: {
      provider: { open: false },
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
    ...overrides,
  };
}

function getButtons() {
  return Array.from(container?.querySelectorAll('button') ?? []);
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

it('renders provider rows and wires provider add, edit, and delete callbacks', async () => {
  const state = createState();
  await renderUi(<AIProvidersProvidersCard state={state} />);

  expect(container?.textContent).toContain('OpenAI');
  expect(container?.textContent).toContain('openai-compatible');

  await act(async () => {
    getButtons()[0]?.click();
    getButtons()
      .slice(-2)
      .forEach((button) => button.click());
  });

  expect(state.modals.openProviderModal).toHaveBeenCalledTimes(2);
  expect(state.modals.openProviderModal).toHaveBeenCalledWith(PROVIDER);
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith({ type: 'provider', item: PROVIDER });
});

it('renders a compact clear-secret action only for providers with a stored key', async () => {
  const state = createState();
  await renderUi(<AIProvidersProvidersCard state={state} />);

  await act(async () => {
    getButtons()
      .find(
        (button) =>
          button.getAttribute('aria-label') ===
          translate('settings.aiProviders.providerSecretClearAction')
      )
      ?.click();
  });

  expect(state.handleClearProviderSecret).toHaveBeenCalledWith('provider-1');

  await renderUi(
    <AIProvidersProvidersCard
      state={createState({
        providers: [{ ...PROVIDER, hasStoredApiKey: false }],
      })}
    />
  );

  expect(
    getButtons().some(
      (button) =>
        button.getAttribute('aria-label') ===
        translate('settings.aiProviders.providerSecretClearAction')
    )
  ).toBe(false);
});

it('renders model rows, default actions, and empty states when providers are unavailable', async () => {
  const state = createState();
  await renderUi(<AIProvidersModelsCard state={state} />);

  expect(container?.textContent).toContain('GPT 4.1');
  expect(container?.textContent).toContain(translate('settings.aiProviders.modelDefaultBadge'));

  await act(async () => {
    getButtons()[0]?.click();
    getButtons()
      .slice(-3)
      .forEach((button) => button.click());
  });

  expect(state.modals.openModelModal).toHaveBeenCalledTimes(2);
  expect(state.modals.openModelModal).toHaveBeenCalledWith(MODEL);
  expect(state.handleDefaultModelChange).toHaveBeenCalledWith('model-1');
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith({ type: 'model', item: MODEL });

  const emptyState = createState({
    providers: [],
    models: [],
    getProviderName: vi.fn(() => 'Unknown'),
  });
  await renderUi(<AIProvidersModelsCard state={emptyState} />);

  expect(container?.textContent).toContain(translate('settings.aiProviders.modelsEmptyTitle'));
  expect(container?.textContent).toContain(
    translate('settings.aiProviders.modelsEmptyDescriptionNoProviders')
  );
  expect(getButtons()[0]?.hasAttribute('disabled')).toBe(true);
});

it('renders chrome-ai status copy for setup, enabled, and unsupported states', async () => {
  const settingUpState = createState({
    chromeAi: {
      ...createMockChromeAiState(),
      availability: 'downloadable',
      isSettingUp: true,
      setupProgress: 42,
    },
  });
  await renderUi(<AIProvidersChromeAiCard state={settingUpState} />);

  expect(container?.textContent).toContain(translate('settings.aiProviders.chromeAiPreparing'));
  expect(container?.textContent).toContain('42%');

  const enabledState = createState({
    chromeAi: {
      ...createMockChromeAiState(),
      enabled: true,
    },
  });
  await renderUi(<AIProvidersChromeAiCard state={enabledState} />);
  expect(container?.textContent).toContain(
    translate('settings.aiProviders.chromeAiEnabledDescription')
  );

  const unsupportedState = createState({
    chromeAi: {
      ...createMockChromeAiState(),
      availability: 'unsupported',
    },
  });
  await renderUi(<AIProvidersChromeAiCard state={unsupportedState} />);
  expect(getButtons()[0]?.hasAttribute('disabled')).toBe(true);
  expect(container?.textContent).toContain(translate('settings.aiProviders.chromeAiUnsupported'));
});
