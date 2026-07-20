// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (
    props: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>
  ) => (
    <button type={props.type ?? 'button'} onClick={props.onClick} disabled={props.disabled}>
      {props.children}
    </button>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (
    props: React.PropsWithChildren<{
      dialogClassName?: string;
      onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
    }>
  ) => (
    <div
      data-ui="ai-modal.product-modal"
      className={props.dialogClassName}
      onKeyDown={props.onKeyDown}
      tabIndex={0}
    >
      {props.children}
    </div>
  ),
  ProductModalBody: (props: React.PropsWithChildren<{ className?: string }>) => (
    <div data-ui="ai-modal.product-modal-body" className={props.className}>
      {props.children}
    </div>
  ),
  ProductModalHeader: (props: { title: React.ReactNode }) => (
    <div data-ui="ai-modal.product-modal-header">{props.title}</div>
  ),
}));

vi.mock('../../data-panel', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../data-panel')>()),
  AIModalDataPanel: (_props: unknown) => <div data-ui="ai-modal.data-panel" />,
}));

vi.mock('../../template-list', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../template-list')>()),
  TemplateList: (_props: unknown) => <div data-ui="ai-modal.template-list" />,
}));

vi.mock('../../../../../features/prompt-templates/editor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../features/prompt-templates/editor')>()),
  PromptTemplateEditor: (_props: unknown) => null,
}));

import { translate } from '../../../../../platform/i18n';
import { AIModalDialog } from './dialog';
import type { useAIModalState } from '../session';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(): ReturnType<typeof useAIModalState> {
  return {
    availableModels: [],
    editingTemplate: undefined,
    handleAddTemplate: vi.fn(),
    handleDeleteTemplate: vi.fn(async () => undefined),
    handleEditTemplate: vi.fn(),
    handleModelSelect: vi.fn(),
    handleResizeStart: vi.fn(),
    handleSaveTemplate: vi.fn(async () => undefined),
    handleSelectTemplate: vi.fn(async () => undefined),
    isEditorOpen: false,
    isResizing: false,
    prompt: '',
    providers: [],
    resizerRef: { current: null },
    selectedData: '',
    selectedModelId: null,
    setIsEditorOpen: vi.fn(),
    setPrompt: vi.fn(),
    setSelectedData: vi.fn(),
    templateSubmitError: null,
    textareaRef: { current: null },
    templates: [],
    templatesLoading: false,
    totalTokens: 0,
  };
}

function createDialogTreeData(): ParsedDOMTree {
  return {
    context: '',
    title: 'Dialog tree',
    structure: [
      {
        children: [],
        id: 'section-1',
        selected: true,
        title: 'Section',
        type: 'section',
      },
    ],
  };
}

async function renderDialog(props: Partial<React.ComponentProps<typeof AIModalDialog>> = {}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <AIModalDialog
        isLoading={false}
        onClose={vi.fn()}
        promptField={<div data-ui="ai-modal.prompt-field" />}
        state={createState()}
        title="AI"
        treeData={null}
        {...props}
      >
        <div data-ui="ai-modal.footer" />
      </AIModalDialog>
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('AIModalDialog', () => {
  it('renders the normal modal content when not loading', async () => {
    await renderDialog();

    expect(container?.querySelector('[data-ui="ai-modal.prompt-field"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="ai-modal.template-list"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="ai-modal.data-panel"]')).not.toBeNull();
    expect(container?.querySelector('[data-ui="ai-modal.loading-state"]')).toBeNull();
  });

  it('shows the waiting overlay and routes cancel back to the caller while loading', async () => {
    const onCancelLoading = vi.fn();

    await renderDialog({
      isLoading: true,
      onCancelLoading,
      treeData: createDialogTreeData(),
    });

    expect(container?.textContent).toContain(translate('aiModal.waitingTitle'));
    expect(container?.textContent).toContain(translate('aiModal.waitingDescription'));

    const cancelButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
      button.textContent?.includes(translate('aiModal.waitingCancelButton'))
    );

    act(() => {
      cancelButton?.click();
    });

    expect(onCancelLoading).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape from the modal surface while idle', async () => {
    const onClose = vi.fn();

    await renderDialog({ onClose });

    act(() => {
      container
        ?.querySelector('[data-ui="ai-modal.product-modal"]')
        ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
