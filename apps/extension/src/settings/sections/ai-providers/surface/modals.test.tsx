// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { AIModel, AIProvider } from '../../../../contracts/settings';
import { translate } from '../../../../platform/i18n';

const {
  confirmDialogPropsMock,
  modelFormContentPropsMock,
  modelFormStateMock,
  providerFormContentPropsMock,
  providerFormStateMock,
} = vi.hoisted(() => ({
  confirmDialogPropsMock: vi.fn(),
  modelFormContentPropsMock: vi.fn(),
  modelFormStateMock: vi.fn(),
  providerFormContentPropsMock: vi.fn(),
  providerFormStateMock: vi.fn(),
}));

vi.mock('../forms/hooks', () => ({
  useModelFormState: modelFormStateMock,
  useProviderFormState: providerFormStateMock,
}));

vi.mock('../forms/model-form-modal-content', () => ({
  ModelFormModalContent: (props: {
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
  }) => {
    modelFormContentPropsMock(props);
    return (
      <form
        data-testid="model-modal-content"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit(event);
        }}
      />
    );
  },
}));

vi.mock('../forms/provider-form-modal-content', () => ({
  ProviderFormModalContentProps: undefined,
  ProviderFormModalContent: (props: {
    onClose: () => void;
    onSubmit: (event: React.FormEvent) => void;
  }) => {
    providerFormContentPropsMock(props);
    return (
      <form
        data-testid="provider-modal-content"
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit(event);
        }}
      />
    );
  },
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    message: string;
    onCancel: () => void;
    onConfirm: () => void;
    title: string;
  }) => {
    confirmDialogPropsMock(props);
    return (
      <div data-testid="confirm-dialog">
        <button type="button" onClick={props.onConfirm}>
          confirm
        </button>
        <button type="button" onClick={props.onCancel}>
          cancel
        </button>
      </div>
    );
  },
}));

import { ConfirmDialog, ModelFormModal, ProviderFormModal } from './modals';

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

async function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function createProviderState() {
  return {
    apiKeyInputRef: { current: null },
    errors: {},
    formData: {
      name: 'Provider',
      connectionType: 'openai-compatible' as const,
      baseUrl: 'https://api.example.com',
    },
    handleApiKeyChange: vi.fn(),
    handleChange: () => vi.fn(),
    handleSubmit: vi.fn().mockResolvedValue(undefined),
    isEditing: false,
    isSaving: false,
  };
}

function createModelState() {
  return {
    errors: {},
    formData: {
      providerId: 'provider-1',
      displayName: 'GPT 4.1',
      modelCode: 'gpt-4.1',
      systemPrompt: 'Prompt',
    },
    handleChange: () => vi.fn(),
    handleProviderChange: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSubmit: vi.fn().mockResolvedValue(undefined),
    isEditing: true,
    isSaving: false,
    textareaRef: { current: null },
  };
}

function expectConfirmDialogProps() {
  expect(confirmDialogPropsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      cancelText: translate('common.actions.cancel'),
      confirmText: translate('common.actions.delete'),
      title: 'Delete provider',
      message: 'Delete this provider?',
    })
  );
}

async function clickConfirmDialogButtons() {
  await act(async () => {
    const confirmDialog = container?.querySelector('[data-testid="confirm-dialog"]');
    const buttons = Array.from(confirmDialog?.querySelectorAll('button') ?? []);
    buttons[0]?.click();
    buttons[1]?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  providerFormContentPropsMock.mockReset();
  providerFormStateMock.mockReset();
  modelFormContentPropsMock.mockReset();
  modelFormStateMock.mockReset();
  confirmDialogPropsMock.mockReset();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

it('maps provider form state into modal content for create and edit flows', async () => {
  const createState = createProviderState();
  providerFormStateMock.mockReturnValueOnce(createState);

  const onSaveCreate = vi.fn();
  await render(<ProviderFormModal provider={null} onClose={vi.fn()} onSave={onSaveCreate} />);

  const createProps = providerFormContentPropsMock.mock.calls[0]?.[0];
  expect(createProps).toMatchObject({
    formData: {
      name: 'Provider',
      baseUrl: 'https://api.example.com',
    },
    hasStoredApiKey: false,
    isEditing: false,
    isSaving: false,
  });
  expect(createProps.apiKeyInputRef).toEqual({ current: null });
  expect(createProps.onApiKeyChange).toBe(createState.handleApiKeyChange);

  await act(async () => {
    container
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(createState.handleSubmit).toHaveBeenCalledWith(expect.anything(), onSaveCreate);

  const editState = {
    ...createProviderState(),
    isEditing: true,
  };
  providerFormStateMock.mockReturnValueOnce(editState);

  const onSaveEdit = vi.fn();
  await render(<ProviderFormModal provider={PROVIDER} onClose={vi.fn()} onSave={onSaveEdit} />);

  const editProps = providerFormContentPropsMock.mock.calls[1]?.[0];
  expect(editProps).toMatchObject({
    hasStoredApiKey: true,
    isEditing: true,
  });
});

async function verifyModelModalAndConfirmDialog() {
  const modelState = createModelState();
  modelFormStateMock.mockReturnValue(modelState);

  const onSave = vi.fn();
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  await render(
    <>
      <ModelFormModal model={MODEL} providers={[PROVIDER]} onClose={vi.fn()} onSave={onSave} />
      <ConfirmDialog
        title="Delete provider"
        message="Delete this provider?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </>
  );

  const modelProps = modelFormContentPropsMock.mock.calls[0]?.[0];
  expect(modelProps).toMatchObject({
    formData: {
      displayName: 'GPT 4.1',
      modelCode: 'gpt-4.1',
      providerId: 'provider-1',
      systemPrompt: 'Prompt',
    },
    isEditing: true,
    isSaving: false,
    providers: [PROVIDER],
  });

  await act(async () => {
    container
      ?.querySelector('[data-testid="model-modal-content"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(modelState.handleSubmit).toHaveBeenCalledWith(expect.anything(), onSave);
  expectConfirmDialogProps();
  await clickConfirmDialogButtons();

  expect(onConfirm).toHaveBeenCalledTimes(1);
  expect(onCancel).toHaveBeenCalledTimes(1);
}

it('wires model modal state and confirm dialog actions', verifyModelModalAndConfirmDialog);
