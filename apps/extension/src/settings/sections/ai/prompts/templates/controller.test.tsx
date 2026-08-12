// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PromptTemplate } from '../../../../../contracts/settings';
import { useTemplatesSection } from './controller';

const { usePromptTemplatesMock, toastSuccessMock, toastErrorMock } = vi.hoisted(() => ({
  usePromptTemplatesMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

vi.mock(
  '../../../../../features/prompt-templates/hooks/use-prompt-templates',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../features/prompt-templates/hooks/use-prompt-templates')
    >()),
    usePromptTemplates: usePromptTemplatesMock,
  })
);

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestState: ReturnType<typeof useTemplatesSection> | null = null;

function createTemplate(template: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: template.id ?? 'template-1',
    name: template.name ?? 'Шаблон',
    content: template.content ?? 'Содержимое',
    isDefault: template.isDefault ?? false,
    ...(template.lastUsedAt === undefined ? {} : { lastUsedAt: template.lastUsedAt }),
  };
}

function createTemplatesHookState(
  overrides: Partial<ReturnType<typeof usePromptTemplatesMock>> = {}
) {
  return {
    templates: [createTemplate()],
    isLoading: false,
    isMutating: false,
    error: null,
    addTemplate: vi.fn(async () => undefined),
    updateTemplate: vi.fn(async () => undefined),
    templateLifecycle: {
      remove: vi.fn(async () => undefined),
      restoreSystem: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => undefined),
    },
    selectTemplate: vi.fn(async () => ''),
    refreshTemplates: vi.fn(async () => undefined),
    ...overrides,
  };
}

function TemplatesHarness() {
  latestState = useTemplatesSection();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<TemplatesHarness />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  toastSuccessMock.mockReset();
  toastErrorMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  latestState = null;
  vi.unstubAllGlobals();
});

async function verifyCreateTemplateFlow() {
  const addTemplate = vi.fn(async () => undefined);
  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({
      addTemplate,
      templates: [],
    })
  );

  await renderHarness();

  act(() => {
    latestState?.openNewTemplateEditor();
  });

  expect(latestState?.isEditorOpen).toBe(true);
  expect(latestState?.editingTemplate).toBeUndefined();
  expect(latestState?.confirmState).toEqual({ isOpen: false, template: null });

  await act(async () => {
    await latestState?.handleSaveTemplate('Новый шаблон', 'Новый текст');
  });

  expect(addTemplate).toHaveBeenCalledWith('Новый шаблон', 'Новый текст');
  expect(latestState?.isEditorOpen).toBe(false);
  expect(toastSuccessMock).not.toHaveBeenCalled();
  expect(toastErrorMock).not.toHaveBeenCalled();
}

async function verifyDeleteTemplateFlow() {
  const template = createTemplate({ id: 'template-delete', name: 'Удалить меня' });
  const removeTemplate = vi.fn(async () => undefined);

  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({
      templateLifecycle: {
        remove: removeTemplate,
        restoreSystem: vi.fn(async () => undefined),
        setEnabled: vi.fn(async () => undefined),
      },
      templates: [template],
    })
  );

  await renderHarness();

  act(() => {
    latestState?.templateLifecycle.requestDelete(template);
  });

  expect(latestState?.confirmState.isOpen).toBe(true);
  expect(latestState?.confirmState.template).toEqual(template);

  await act(async () => {
    await latestState?.confirmDelete();
  });

  expect(removeTemplate).toHaveBeenCalledWith('template-delete');
  expect(latestState?.confirmState).toEqual({ isOpen: false, template: null });
  expect(toastSuccessMock).not.toHaveBeenCalled();
}

async function verifyEditTemplateFlow() {
  const template = createTemplate({ id: 'template-edit', name: 'Старое имя' });
  const updateTemplate = vi.fn(async () => undefined);

  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({
      templates: [template],
      updateTemplate,
    })
  );

  await renderHarness();

  act(() => {
    latestState?.handleEditTemplate(template);
  });

  expect(latestState?.editingTemplate).toEqual({
    id: 'template-edit',
    name: 'Старое имя',
    content: 'Содержимое',
  });

  await act(async () => {
    await latestState?.handleSaveTemplate('Новое имя', 'Новый контент');
  });

  expect(updateTemplate).toHaveBeenCalledWith('template-edit', {
    name: 'Новое имя',
    content: 'Новый контент',
  });
  expect(latestState?.isEditorOpen).toBe(false);
}

async function verifyResetTemplateFlow() {
  const resetTemplate = vi.fn(async () => undefined);
  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({
      templateLifecycle: {
        remove: vi.fn(async () => undefined),
        restoreSystem: resetTemplate,
        setEnabled: vi.fn(async () => undefined),
      },
    })
  );

  await renderHarness();
  await act(async () => {
    await latestState?.templateLifecycle.restore('default-translate');
  });

  expect(resetTemplate).toHaveBeenCalledWith('default-translate');
  expect(toastSuccessMock).not.toHaveBeenCalled();
}

async function verifyCreateTemplateFailureFlow() {
  const addTemplate = vi.fn(async () => {
    throw new Error('save failed');
  });

  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({
      addTemplate,
      templates: [],
    })
  );

  await renderHarness();

  act(() => {
    latestState?.openNewTemplateEditor();
  });

  let thrownError: unknown;

  await act(async () => {
    try {
      await latestState?.handleSaveTemplate('Новый шаблон', 'Новый текст');
    } catch (error) {
      thrownError = error;
    }
  });

  expect(addTemplate).toHaveBeenCalledWith('Новый шаблон', 'Новый текст');
  expect(thrownError).toEqual(expect.any(Error));
  expect(latestState?.isEditorOpen).toBe(true);
  expect(toastErrorMock).toHaveBeenCalledTimes(1);
}

async function verifyDeleteTemplateFailureFlow() {
  const template = createTemplate({ id: 'template-delete', name: 'Удалить меня' });
  const removeTemplate = vi.fn(async () => {
    throw new Error('delete failed');
  });

  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({
      templateLifecycle: {
        remove: removeTemplate,
        restoreSystem: vi.fn(async () => undefined),
        setEnabled: vi.fn(async () => undefined),
      },
      templates: [template],
    })
  );

  await renderHarness();

  act(() => {
    latestState?.templateLifecycle.requestDelete(template);
  });

  let thrownError: unknown;

  await act(async () => {
    try {
      await latestState?.confirmDelete();
    } catch (error) {
      thrownError = error;
    }
  });

  expect(removeTemplate).toHaveBeenCalledWith('template-delete');
  expect(thrownError).toEqual(expect.any(Error));
  expect(latestState?.confirmState.isOpen).toBe(true);
  expect(toastErrorMock).toHaveBeenCalledTimes(1);
}

async function verifyMutationStateDoesNotBecomeInitialLoading() {
  usePromptTemplatesMock.mockReturnValue(
    createTemplatesHookState({ isLoading: false, isMutating: true })
  );

  await renderHarness();

  expect(latestState?.status).toMatchObject({ isLoading: false, isMutating: true });
}

describe('useTemplatesSection', () => {
  it('creates a new template and closes the editor after save', verifyCreateTemplateFlow);
  it(
    'opens delete confirmation and removes the selected template on confirm',
    verifyDeleteTemplateFlow
  );
  it('edits an existing template through the shared editor flow', verifyEditTemplateFlow);
  it('restores a customized system template through the feature owner', verifyResetTemplateFlow);
  it(
    'keeps the editor open and shows an error toast when save fails',
    verifyCreateTemplateFailureFlow
  );
  it(
    'keeps the delete dialog open and shows an error toast when delete fails',
    verifyDeleteTemplateFailureFlow
  );
  it(
    'keeps initial loading separate from background mutation state',
    verifyMutationStateDoesNotBecomeInitialLoading
  );
});
