// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import type { AiProvidersSectionState } from '../../controller/types';
import { createMockChromeAiState, createMockSecretProtectionState } from '../test-support';

function MockConfirmDialog(props: {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div data-testid="confirm-dialog">
      <span>{props.title}</span>
      <span>{props.message}</span>
      <span>{props.confirmText}</span>
      <span>{props.cancelText}</span>
      <button type="button" onClick={() => void props.onConfirm()}>
        confirm-delete
      </button>
      <button type="button" onClick={props.onCancel}>
        cancel-delete
      </button>
    </div>
  );
}

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>();

  return {
    ...original,
    ProductConfirmDialog: MockConfirmDialog,
  };
});

vi.mock('../../forms/provider-form-modal-content', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../forms/provider-form-modal-content')>();

  return {
    ...original,
    ProviderFormModalContent: () => null,
  };
});

vi.mock('../../forms/model-form-modal-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../forms/model-form-modal-content')>()),
  ModelFormModalContent: () => null,
}));

vi.mock('../../forms/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../forms/hooks')>()),
  useProviderFormState: vi.fn(() => ({})),
  useModelFormState: vi.fn(() => ({})),
}));

import { AIProvidersSectionModals, ConfirmDialog } from './modals';

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

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

function createPromptState(value: string) {
  return {
    isSaving: false,
    saveError: null,
    value,
    textareaRef: { current: null },
    setValue: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(undefined),
    handleResizeStart: vi.fn(),
  };
}

function createState(overrides: Partial<AiProvidersSectionState> = {}): AiProvidersSectionState {
  const baseState: AiProvidersSectionState = {
    chromeAi: createMockChromeAiState(),
    secretProtection: createMockSecretProtectionState(),
    providers: [PROVIDER],
    models: [MODEL],
    defaultModelId: 'model-1',
    isLoading: false,
    modelOptions: [],
    prompts: {
      global: createPromptState('Global prompt'),
      scenarioEditor: createPromptState('Scenario prompt'),
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
  };

  return {
    ...baseState,
    ...overrides,
    chromeAi: { ...baseState.chromeAi, ...(overrides.chromeAi ?? {}) },
    secretProtection: {
      ...baseState.secretProtection,
      ...(overrides.secretProtection ?? {}),
    },
    prompts: { ...baseState.prompts, ...(overrides.prompts ?? {}) },
    modals: { ...baseState.modals, ...(overrides.modals ?? {}) },
  };
}

function getButtonByText(text: string) {
  return Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(text)
  );
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

it('routes provider delete confirmation through the provider handler', async () => {
  const state = createState({
    modals: {
      ...createState().modals,
      confirmDelete: { type: 'provider', item: PROVIDER },
    },
  });

  await renderUi(<AIProvidersSectionModals state={state} />);

  expect(container?.querySelector('[data-testid="confirm-dialog"]')?.textContent).toContain(
    translate('settings.aiProviders.deleteProviderTitle')
  );
  expect(container?.textContent).toContain(PROVIDER.name);

  await act(async () => {
    getButtonByText('confirm-delete')?.click();
    getButtonByText('cancel-delete')?.click();
  });

  expect(state.handleDeleteProvider).toHaveBeenCalledTimes(1);
  expect(state.handleDeleteModel).not.toHaveBeenCalled();
  expect(state.modals.setConfirmDelete).toHaveBeenCalledWith(null);
});

it('routes model delete confirmation through the model handler and exposes confirm dialog labels', async () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const state = createState({
    modals: {
      ...createState().modals,
      confirmDelete: { type: 'model', item: MODEL },
    },
  });

  await renderUi(
    <>
      <ConfirmDialog
        title="Custom title"
        message="Custom message"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
      <AIProvidersSectionModals state={state} />
    </>
  );

  expect(container?.textContent).toContain('Custom title');
  expect(container?.textContent).toContain('Custom message');
  expect(container?.textContent).toContain(translate('common.actions.delete'));
  expect(container?.textContent).toContain(translate('common.actions.cancel'));
  expect(container?.textContent).toContain(translate('settings.aiProviders.deleteModelTitle'));
  expect(container?.textContent).toContain(MODEL.displayName);

  await act(async () => {
    getButtonByText('confirm-delete')?.click();
    getButtonByText('cancel-delete')?.click();
  });

  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
});
