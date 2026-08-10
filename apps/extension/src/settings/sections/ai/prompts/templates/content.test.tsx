// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { translate } from '../../../../../platform/i18n';
import type { PromptTemplate } from '../../../../../contracts/settings';

const { confirmDialogPropsSpy, promptTemplateEditorPropsSpy } = vi.hoisted(() => ({
  confirmDialogPropsSpy: vi.fn(),
  promptTemplateEditorPropsSpy: vi.fn(),
}));

vi.mock('../../../../../features/prompt-templates/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/prompt-templates/editor')>()),
  PromptTemplateEditor: (props: {
    isOpen: boolean;
    isLoading: boolean;
    onClose: () => void;
    onSave: (name: string, content: string) => Promise<void>;
    submitError?: string | null;
    template?: { id: string; name: string; content: string };
  }) => {
    promptTemplateEditorPropsSpy(props);

    return props.isOpen ? (
      <div data-testid="template-editor">{props.template?.name ?? 'new'}</div>
    ) : null;
  },
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: {
    cancelText: string;
    confirmText: string;
    isOpen: boolean;
    message: string;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
    title: string;
  }) => {
    confirmDialogPropsSpy(props);

    if (!props.isOpen) {
      return null;
    }

    return (
      <div data-testid="confirm-dialog">
        <span>{props.title}</span>
        <span>{props.message}</span>
        <button onClick={() => void props.onConfirm()}>{props.confirmText}</button>
        <button onClick={props.onCancel}>{props.cancelText}</button>
      </div>
    );
  },
}));

import { TemplatesSectionContent } from './content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createTemplate(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
  return {
    id: overrides.id ?? 'template-1',
    name: overrides.name ?? 'Template 1',
    content: overrides.content ?? 'Template body',
    isDefault: overrides.isDefault ?? false,
    ...(overrides.customized === undefined ? {} : { customized: overrides.customized }),
    ...(overrides.lastUsedAt === undefined ? {} : { lastUsedAt: overrides.lastUsedAt }),
  };
}

function createProps(overrides: Partial<Parameters<typeof TemplatesSectionContent>[0]> = {}) {
  return {
    closeDeleteDialog: vi.fn(),
    closeTemplateEditor: vi.fn(),
    confirmDelete: vi.fn(async () => undefined),
    confirmState: { isOpen: false, template: null },
    handleEditTemplate: vi.fn(),
    handleSaveTemplate: vi.fn(async () => undefined),
    templateLifecycle: {
      move: vi.fn(async () => undefined),
      requestDelete: vi.fn(),
      restore: vi.fn(async () => undefined),
      setEnabled: vi.fn(async () => undefined),
    },
    isEditorOpen: false,
    status: { isLoading: false, isMutating: false, submitError: null },
    openNewTemplateEditor: vi.fn(),
    templates: [],
    ...(overrides.editingTemplate === undefined
      ? overrides
      : { ...overrides, editingTemplate: overrides.editingTemplate }),
  };
}

function renderSection(overrides: Partial<Parameters<typeof TemplatesSectionContent>[0]> = {}) {
  const props = createProps(overrides);

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<TemplatesSectionContent {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  confirmDialogPropsSpy.mockReset();
  promptTemplateEditorPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function verifyEmptyStateAndAddAction() {
  const props = renderSection();

  expect(container?.textContent).toContain(translate('templates.section.emptyTitle'));

  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent?.includes(translate('templates.section.addButton'))) {
        button.click();
      }
    });
  });

  expect(props.openNewTemplateEditor).toHaveBeenCalledTimes(1);
}

function verifyTemplateRowActionsAndDialogs() {
  const systemTemplate = createTemplate({
    id: 'template-2',
    name: 'Template 2',
    isDefault: true,
    customized: true,
  });
  const userTemplate = createTemplate({ id: 'template-user', name: 'User template' });
  const props = renderSection({
    confirmState: { isOpen: true, template: userTemplate },
    editingTemplate: {
      id: systemTemplate.id,
      name: systemTemplate.name,
      content: systemTemplate.content,
    },
    isEditorOpen: true,
    templates: [systemTemplate, userTemplate],
  });
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('settings.collection.actions.edit')}"]`
      )
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('settings.collection.actions.disable')}"]`
      )
      ?.click();
    container
      ?.querySelectorAll<HTMLButtonElement>(
        `button[aria-label="${translate('settings.collection.actions.menu')}"]`
      )[0]
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('templates.section.restoreAction')}"]`
      )
      ?.click();
    container
      ?.querySelectorAll<HTMLButtonElement>(
        `button[aria-label="${translate('settings.collection.actions.menu')}"]`
      )[1]
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('settings.collection.actions.delete')}"]`
      )
      ?.click();
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      if (button.textContent === translate('common.actions.delete')) {
        button.click();
      }
      if (button.textContent === translate('common.actions.cancel')) {
        button.click();
      }
    });
  });

  expect(props.handleEditTemplate).toHaveBeenCalledWith(systemTemplate);
  expect(props.templateLifecycle.requestDelete).toHaveBeenCalledWith(userTemplate);
  expect(props.templateLifecycle.restore).toHaveBeenCalledWith(systemTemplate.id);
  expect(props.templateLifecycle.setEnabled).toHaveBeenCalledWith(systemTemplate.id, false);
  expect(container?.textContent).not.toContain(translate('settings.collection.defaultBadge'));
  expect(container?.textContent).not.toContain(translate('settings.collection.builtInBadge'));
  expect(props.confirmDelete).toHaveBeenCalledTimes(1);
  expect(props.closeDeleteDialog).toHaveBeenCalledTimes(1);
  expect(promptTemplateEditorPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      isOpen: true,
      template: expect.objectContaining({ id: systemTemplate.id }),
    })
  );
  expect(confirmDialogPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({
      isOpen: true,
      title: translate('templates.section.deleteCustomTitle'),
    })
  );
}

function verifyTemplatesLoadingStateDelay() {
  renderSection({ status: { isLoading: true, isMutating: false, submitError: null } });
  expect(container?.querySelector('[data-testid="settings-card-loading"]')).toBeTruthy();
  expect(container?.textContent).not.toContain(translate('templates.section.emptyTitle'));
}

function verifyTemplatesStayVisibleWhileMutating() {
  renderSection({
    status: { isLoading: false, isMutating: true, submitError: null },
    templates: [createTemplate()],
  });
  expect(container?.textContent).toContain('Template 1');
  expect(container?.querySelector('[data-testid="settings-card-loading"]')).toBeFalsy();
}

function runTemplatesSectionContentSuite() {
  it('renders the empty templates state and opens the add flow', verifyEmptyStateAndAddAction);
  it('delays the card loading placeholder while templates load', verifyTemplatesLoadingStateDelay);
  it(
    'keeps template rows mounted while a mutation is saving',
    verifyTemplatesStayVisibleWhileMutating
  );
  it(
    'routes row actions, hover updates, editor props, and delete dialog events',
    verifyTemplateRowActionsAndDialogs
  );
}

describe('TemplatesSectionContent', runTemplatesSectionContentSuite);
