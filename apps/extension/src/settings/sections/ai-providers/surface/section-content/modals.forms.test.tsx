// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../../contracts/settings';
import type { AiProvidersSectionState } from '../../controller/types';
import { createMockChromeAiState, createMockSecretProtectionState } from '../test-support';

const providerFormHookState = {
  apiKeyInputRef: { current: null },
  errors: {},
  formData: { baseUrl: 'https://api.openai.com/v1', name: 'OpenAI' },
  handleApiKeyChange: vi.fn(),
  handleChange: vi.fn(() => vi.fn()),
  handleSubmit: vi.fn(async (_event: React.FormEvent, onSave: () => void) => onSave()),
  isEditing: true,
  isSaving: false,
};

const modelFormHookState = {
  errors: {},
  formData: {
    displayName: 'GPT 4.1',
    modelCode: 'gpt-4.1',
    providerId: 'provider-1',
    systemPrompt: 'Prompt',
  },
  handleChange: vi.fn(() => vi.fn()),
  handleProviderChange: vi.fn(),
  handleResizeStart: vi.fn(),
  handleSubmit: vi.fn(async (_event: React.FormEvent, onSave: () => void) => onSave()),
  isEditing: true,
  isSaving: false,
  textareaRef: { current: null },
};

const createSubmitEvent = () => ({ preventDefault: vi.fn() }) as unknown as React.FormEvent;

function MockProviderFormModalContent(props: {
  formData: { baseUrl: string; name: string };
  hasStoredApiKey: boolean;
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void | Promise<void>;
}) {
  return (
    <form
      data-testid="provider-modal"
      data-stored-api-key={String(props.hasStoredApiKey)}
      data-editing={String(props.isEditing)}
      data-saving={String(props.isSaving)}
      onSubmit={(event) => void props.onSubmit(event)}
    >
      <span>{props.formData.name}</span>
      <span>{props.formData.baseUrl}</span>
      <button type="button" onClick={() => void props.onSubmit(createSubmitEvent())}>
        save-provider
      </button>
      <button type="button" onClick={props.onClose}>
        close-provider
      </button>
    </form>
  );
}

function MockModelFormModalContent(props: {
  formData: { displayName: string; modelCode: string; providerId: string; systemPrompt: string };
  isEditing: boolean;
  isSaving: boolean;
  onClose: () => void;
  onProviderChange: (value: string) => void;
  onResizeStart: (event: React.MouseEvent) => void;
  onSubmit: (event: React.FormEvent) => void | Promise<void>;
  providers: AIProvider[];
}) {
  return (
    <form
      data-testid="model-modal"
      data-editing={String(props.isEditing)}
      data-saving={String(props.isSaving)}
      onSubmit={(event) => void props.onSubmit(event)}
    >
      <span>{props.formData.displayName}</span>
      <span>{props.formData.modelCode}</span>
      <span>{props.formData.providerId}</span>
      <span>{props.formData.systemPrompt}</span>
      <span>{props.providers.length}</span>
      <button type="button" onClick={() => void props.onSubmit(createSubmitEvent())}>
        save-model
      </button>
      <button type="button" onClick={() => props.onProviderChange('provider-2')}>
        change-provider
      </button>
      <button type="button" onClick={(event) => props.onResizeStart(event)}>
        resize-model
      </button>
      <button type="button" onClick={props.onClose}>
        close-model
      </button>
    </form>
  );
}

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', () => ({
  ProductConfirmDialog: () => null,
  ProductConfirmDialogProps: undefined,
}));

vi.mock('../../forms/provider-form-modal-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../forms/provider-form-modal-content')>()),
  ProviderFormModalContent: MockProviderFormModalContent,
}));

vi.mock('../../forms/model-form-modal-content', () => ({
  ModelFormModalContent: MockModelFormModalContent,
}));

vi.mock('../../forms/hooks', () => ({
  useProviderFormState: vi.fn(() => providerFormHookState),
  useModelFormState: vi.fn(() => modelFormHookState),
}));

import { AIProvidersSectionModals } from './modals';

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
    prompts: { ...baseState.prompts, ...(overrides.prompts ?? {}) },
    modals: { ...baseState.modals, ...(overrides.modals ?? {}) },
  };
}

const getButtonByText = (text: string) =>
  Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(text)
  );

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  providerFormHookState.handleSubmit.mockClear();
  modelFormHookState.handleProviderChange.mockClear();
  modelFormHookState.handleResizeStart.mockClear();
  modelFormHookState.handleSubmit.mockClear();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('keeps the modal owner empty when no modal state is open', async () => {
  await renderUi(<AIProvidersSectionModals state={createState()} />);

  expect(container?.textContent).toBe('');
});

it('renders provider and model modals and routes submit and close handlers through state seams', async () => {
  const state = createState({
    modals: {
      ...createState().modals,
      provider: { open: true, provider: PROVIDER },
      model: { open: true, model: MODEL },
    },
  });

  await renderUi(<AIProvidersSectionModals state={state} />);

  expect(container?.querySelector('[data-testid="provider-modal"]')?.textContent).toContain(
    'OpenAI'
  );
  expect(
    container?.querySelector('[data-testid="provider-modal"]')?.getAttribute('data-stored-api-key')
  ).toBe('true');
  expect(container?.querySelector('[data-testid="model-modal"]')?.textContent).toContain('GPT 4.1');

  await act(async () => {
    getButtonByText('save-provider')?.click();
    getButtonByText('close-provider')?.click();
    getButtonByText('save-model')?.click();
    getButtonByText('change-provider')?.click();
    getButtonByText('resize-model')?.click();
    getButtonByText('close-model')?.click();
  });

  expect(providerFormHookState.handleSubmit).toHaveBeenCalledTimes(1);
  expect(modelFormHookState.handleSubmit).toHaveBeenCalledTimes(1);
  expect(modelFormHookState.handleProviderChange).toHaveBeenCalledWith('provider-2');
  expect(modelFormHookState.handleResizeStart).toHaveBeenCalledTimes(1);
  expect(state.modals.closeProviderModal).toHaveBeenCalledTimes(2);
  expect(state.modals.closeModelModal).toHaveBeenCalledTimes(2);
  expect(state.reloadData).toHaveBeenCalledTimes(2);
});

it('keeps the modal open when reload after save fails', async () => {
  const state = createState({
    modals: {
      ...createState().modals,
      provider: { open: true, provider: PROVIDER },
    },
    reloadData: vi.fn().mockRejectedValue(new Error('reload failed')),
  });
  providerFormHookState.handleSubmit.mockImplementationOnce(async (_event, onSave) => {
    await expect(onSave()).rejects.toThrow('reload failed');
  });

  await renderUi(<AIProvidersSectionModals state={state} />);

  await act(async () => {
    getButtonByText('save-provider')?.click();
  });

  expect(state.reloadData).toHaveBeenCalledTimes(1);
  expect(state.modals.closeProviderModal).not.toHaveBeenCalled();
});
