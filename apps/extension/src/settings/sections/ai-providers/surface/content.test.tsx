// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import type { AIModel, AIProvider } from '../../../../contracts/settings';
import type { AiProvidersSectionState } from '../controller/types';
import { createMockChromeAiState, createMockSecretProtectionState } from './test-support';

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => {
  const ReactModule = await import('react');
  const actual = await importOriginal<typeof import('@sniptale/ui/product-form-controls')>();
  return {
    ...actual,
    ProductTextarea: ReactModule.forwardRef<
      HTMLTextAreaElement,
      React.TextareaHTMLAttributes<HTMLTextAreaElement>
    >(function ProductTextarea(props, ref) {
      return <textarea ref={ref} {...props} />;
    }),
  };
});

function MockProviderFormModal(props: {
  provider?: AIProvider | null;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <div data-testid="provider-modal">
      <span>{props.provider?.name ?? 'new-provider'}</span>
      <button type="button" onClick={() => void props.onSave()}>
        save-provider
      </button>
      <button type="button" onClick={props.onClose}>
        close-provider
      </button>
    </div>
  );
}

function MockModelFormModal(props: {
  model?: AIModel | null;
  onClose: () => void;
  onSave: () => Promise<void>;
  providers: AIProvider[];
}) {
  return (
    <div data-testid="model-modal">
      <span>{props.model?.displayName ?? 'new-model'}</span>
      <span>{props.providers.length}</span>
      <button type="button" onClick={() => void props.onSave()}>
        save-model
      </button>
      <button type="button" onClick={props.onClose}>
        close-model
      </button>
    </div>
  );
}

function MockConfirmDialog(props: {
  message: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
  title: string;
}) {
  return (
    <div data-testid="confirm-dialog">
      <span>{props.title}</span>
      <span>{props.message}</span>
      <button type="button" onClick={() => void props.onConfirm()}>
        confirm-delete
      </button>
      <button type="button" onClick={props.onCancel}>
        cancel-delete
      </button>
    </div>
  );
}

function renderMockSectionModals(props: { state: AiProvidersSectionState }) {
  const { modals } = props.state;

  return (
    <>
      {modals.provider.open ? (
        <MockProviderFormModal
          onClose={modals.closeProviderModal}
          onSave={async () => {
            modals.closeProviderModal();
            await props.state.reloadData();
          }}
          {...(modals.provider.provider === undefined
            ? {}
            : { provider: modals.provider.provider })}
        />
      ) : null}

      {modals.model.open ? (
        <MockModelFormModal
          providers={props.state.providers}
          onClose={modals.closeModelModal}
          onSave={async () => {
            modals.closeModelModal();
            await props.state.reloadData();
          }}
          {...(modals.model.model === undefined ? {} : { model: modals.model.model })}
        />
      ) : null}

      {modals.confirmDelete ? (
        <MockConfirmDialog
          title={
            modals.confirmDelete.type === 'provider'
              ? translate('settings.aiProviders.deleteProviderTitle')
              : translate('settings.aiProviders.deleteModelTitle')
          }
          message={translate('settings.aiProviders.deleteProviderTitle')}
          onConfirm={
            modals.confirmDelete.type === 'provider'
              ? props.state.handleDeleteProvider
              : props.state.handleDeleteModel
          }
          onCancel={() => modals.setConfirmDelete(null)}
        />
      ) : null}
    </>
  );
}

vi.mock('./modals', () => ({
  AIProvidersSectionModals: renderMockSectionModals,
  ProviderFormModal: MockProviderFormModal,
  ModelFormModal: MockModelFormModal,
  ConfirmDialog: MockConfirmDialog,
}));
import { AIProvidersSectionContent } from './content';

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

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

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

function createModalState() {
  return {
    provider: { open: false },
    model: { open: false },
    confirmDelete: null,
    openProviderModal: vi.fn(),
    closeProviderModal: vi.fn(),
    openModelModal: vi.fn(),
    closeModelModal: vi.fn(),
    setConfirmDelete: vi.fn(),
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
    modals: createModalState(),
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
    chromeAi: {
      ...baseState.chromeAi,
      ...(overrides.chromeAi ?? {}),
    },
    prompts: {
      ...baseState.prompts,
      ...(overrides.prompts ?? {}),
    },
    modals: {
      ...baseState.modals,
      ...(overrides.modals ?? {}),
    },
  };
}

const getButtonByText = (text: string) =>
  Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(text)
  );

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

it('opens advanced prompt editing and wires prompt actions', async () => {
  const state = createState();
  await renderUi(<AIProvidersSectionContent state={state} />);

  const disclosureButton = getButtonByText(translate('settings.aiProviders.showAdvanced'));
  await act(async () => {
    disclosureButton?.click();
  });

  const textareas = Array.from(container?.querySelectorAll('textarea') ?? []);
  expect(textareas).toHaveLength(2);

  await act(async () => {
    textareas[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    textareas[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    setTextareaValue(textareas[0]!, 'Updated global prompt');
    setTextareaValue(textareas[1]!, 'Updated scenario prompt');
  });

  expect(state.prompts.global.setValue).toHaveBeenCalledWith('Updated global prompt');
  expect(state.prompts.scenarioEditor.setValue).toHaveBeenCalledWith('Updated scenario prompt');

  const saveButtons = Array.from(container?.querySelectorAll('button') ?? []).filter(
    (button) =>
      button.textContent?.includes(translate('settings.aiProviders.globalPromptSaveButton')) ||
      button.textContent?.includes(translate('settings.aiProviders.scenarioEditorPromptSaveButton'))
  );
  await act(async () => {
    saveButtons[0]?.click();
    saveButtons[1]?.click();
  });

  expect(state.prompts.global.handleSave).toHaveBeenCalledTimes(1);
  expect(state.prompts.scenarioEditor.handleSave).toHaveBeenCalledTimes(1);
});
