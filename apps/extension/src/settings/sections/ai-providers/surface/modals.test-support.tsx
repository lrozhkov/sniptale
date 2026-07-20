import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../contracts/settings';
import type { AiProvidersSectionState } from '../controller/types';
import { createMockChromeAiState, createMockSecretProtectionState } from './test-support';

export const PROVIDER: AIProvider = {
  id: 'provider-1',
  name: 'OpenAI',
  connectionType: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  hasStoredApiKey: true,
  createdAt: 1,
};

export const MODEL: AIModel = {
  id: 'model-1',
  providerId: 'provider-1',
  modelCode: 'gpt-4.1',
  displayName: 'GPT 4.1',
  systemPrompt: 'Prompt',
};

export function createProviderState() {
  return {
    apiKeyInputRef: { current: null },
    errors: {},
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible' as const,
      baseUrl: 'https://api.example.com',
    },
    handleApiKeyChange: () => undefined,
    handleChange: () => () => undefined,
    handleSubmit: async () => undefined,
    isEditing: false,
    isSaving: false,
  };
}

export function createModelState() {
  return {
    errors: {},
    formData: {
      providerId: 'provider-1',
      displayName: 'GPT 4.1',
      modelCode: 'gpt-4.1',
      systemPrompt: 'Prompt',
    },
    handleChange: () => () => undefined,
    handleProviderChange: () => undefined,
    handleResizeStart: () => undefined,
    handleSubmit: async () => undefined,
    isEditing: true,
    isSaving: false,
    textareaRef: { current: null },
  };
}

export function createSubmittingState<
  T extends ReturnType<typeof createProviderState> | ReturnType<typeof createModelState>,
>(
  state: T,
  handleSubmit: (event: React.FormEvent, onSave: () => Promise<void> | void) => Promise<void>
) {
  return {
    ...state,
    handleSubmit,
  };
}

export type AiProvidersSectionStateOverrides = Partial<Omit<AiProvidersSectionState, 'modals'>> & {
  modals?: Partial<AiProvidersSectionState['modals']>;
};

function createPromptState(): AiProvidersSectionState['prompts']['global'] {
  return {
    isSaving: false,
    saveError: null,
    value: 'Prompt',
    textareaRef: { current: null },
    setValue: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(undefined),
    handleResizeStart: vi.fn(),
  };
}

export function createBaseSectionState(
  overrides: AiProvidersSectionStateOverrides
): AiProvidersSectionState {
  const baseModals: AiProvidersSectionState['modals'] = {
    provider: { open: false },
    model: { open: false },
    confirmDelete: null,
    openProviderModal: vi.fn(),
    closeProviderModal: vi.fn(),
    openModelModal: vi.fn(),
    closeModelModal: vi.fn(),
    setConfirmDelete: vi.fn(),
  };
  const baseState: AiProvidersSectionState = {
    chromeAi: createMockChromeAiState(),
    secretProtection: createMockSecretProtectionState(),
    providers: [PROVIDER],
    models: [MODEL],
    defaultModelId: MODEL.id,
    isLoading: false,
    modelOptions: [],
    prompts: { global: createPromptState(), scenarioEditor: createPromptState() },
    modals: baseModals,
    handleDefaultModelChange: vi.fn().mockResolvedValue(undefined),
    handleClearProviderSecret: vi.fn().mockResolvedValue(undefined),
    handleDeleteProvider: vi.fn().mockResolvedValue(undefined),
    handleDeleteModel: vi.fn().mockResolvedValue(undefined),
    reloadData: vi.fn().mockResolvedValue(undefined),
    getProviderName: vi.fn(() => PROVIDER.name),
  };

  return {
    ...baseState,
    ...overrides,
    modals: { ...baseModals, ...(overrides.modals ?? {}) },
  };
}

export async function renderIntoRoot(args: {
  container: HTMLDivElement | null;
  node: React.ReactNode;
  root: Root | null;
}) {
  if (!args.container) {
    args.container = document.createElement('div');
    document.body.appendChild(args.container);
    args.root = createRoot(args.container);
  }

  await act(async () => {
    args.root?.render(args.node);
  });

  return args;
}

export async function unmountRoot(root: Root | null) {
  await act(async () => {
    root?.unmount();
  });
}
