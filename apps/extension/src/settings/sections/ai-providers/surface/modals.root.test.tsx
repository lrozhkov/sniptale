// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import type { Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

vi.mock('../forms/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../forms/hooks')>()),
  useModelFormState: modelFormStateMock,
  useProviderFormState: providerFormStateMock,
}));

vi.mock('../forms/model-form-modal-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../forms/model-form-modal-content')>()),
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

vi.mock('../forms/provider-form-modal-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../forms/provider-form-modal-content')>()),
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

import { AIProvidersSectionModals } from './modals';
import {
  createBaseSectionState,
  createModelState,
  createProviderState,
  createSubmittingState,
  type AiProvidersSectionStateOverrides,
  MODEL,
  PROVIDER,
  renderIntoRoot,
  unmountRoot,
} from './modals.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderSectionModals(stateOverrides: AiProvidersSectionStateOverrides) {
  return renderIntoRoot({
    container,
    node: <AIProvidersSectionModals state={createBaseSectionState(stateOverrides)} />,
    root,
  }).then((rendered) => {
    container = rendered.container;
    root = rendered.root;
  });
}

function getRenderedProviderProps() {
  return providerFormContentPropsMock.mock.calls.at(-1)?.[0] as {
    onClose: () => void;
  };
}

function getRenderedModelProps() {
  return modelFormContentPropsMock.mock.calls.at(-1)?.[0] as {
    onClose: () => void;
  };
}

async function submitOpenFormsAndConfirmDelete() {
  await act(async () => {
    container
      ?.querySelector('[data-testid="provider-modal-content"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    container
      ?.querySelector('[data-testid="model-modal-content"]')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    Array.from(
      container?.querySelectorAll<HTMLButtonElement>('[data-testid="confirm-dialog"] button') ?? []
    ).forEach((button) => button.click());
  });
}

async function confirmDeleteDialog() {
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('[data-testid="confirm-dialog"] button')?.click();
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
  await unmountRoot(root);
  container?.remove();
  container = null;
  root = null;
});

it('renders section modals root and forwards provider/model closeouts plus delete confirmation', async () => {
  providerFormStateMock.mockReturnValue(
    createSubmittingState(createProviderState(), async (_event, onSave) => {
      await onSave();
    })
  );
  modelFormStateMock.mockReturnValue(
    createSubmittingState(createModelState(), async (_event, onSave) => {
      await onSave();
    })
  );
  const closeProviderModal = vi.fn();
  const closeModelModal = vi.fn();
  const reloadData = vi.fn(async () => undefined);
  const setConfirmDelete = vi.fn();
  const handleDeleteProvider = vi.fn();

  await renderSectionModals({
    reloadData,
    handleDeleteProvider,
    modals: {
      provider: { open: true, provider: null },
      model: { open: true, model: null },
      confirmDelete: { type: 'provider', item: PROVIDER },
      closeProviderModal,
      closeModelModal,
      setConfirmDelete,
    },
  });

  getRenderedProviderProps().onClose();
  getRenderedModelProps().onClose();

  await submitOpenFormsAndConfirmDelete();

  expect(closeProviderModal).toHaveBeenCalledTimes(2);
  expect(closeModelModal).toHaveBeenCalledTimes(2);
  expect(reloadData).toHaveBeenCalledTimes(2);
  expect(handleDeleteProvider).toHaveBeenCalledTimes(1);
  expect(setConfirmDelete).toHaveBeenCalledWith(null);
});

it('routes model deletion and explicit modal payloads through the section modals root', async () => {
  providerFormStateMock.mockReturnValue(createProviderState());
  modelFormStateMock.mockReturnValue(createModelState());
  const handleDeleteModel = vi.fn();

  await renderSectionModals({
    handleDeleteModel,
    modals: {
      provider: { open: true, provider: PROVIDER },
      model: { open: true, model: MODEL },
      confirmDelete: { type: 'model', item: MODEL },
      closeProviderModal: vi.fn(),
      closeModelModal: vi.fn(),
      setConfirmDelete: vi.fn(),
    },
  });

  expect(providerFormContentPropsMock.mock.calls.at(-1)?.[0]).toEqual(
    expect.objectContaining({
      hasStoredApiKey: true,
    })
  );
  expect(modelFormContentPropsMock.mock.calls.at(-1)?.[0]).toEqual(
    expect.objectContaining({
      formData: expect.objectContaining({
        displayName: 'GPT 4.1',
        modelCode: 'gpt-4.1',
      }),
    })
  );
  expect(confirmDialogPropsMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      title: expect.any(String),
      message: expect.stringContaining(MODEL.displayName),
    })
  );

  await confirmDeleteDialog();

  expect(handleDeleteModel).toHaveBeenCalledTimes(1);
});
