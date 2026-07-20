// @vitest-environment jsdom

import { act } from 'react';
import type React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fieldsMock, translateMock } = vi.hoisted(() => ({
  fieldsMock: vi.fn(() => <div data-testid="template-fields">Fields</div>),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: ({
    children,
    disabled,
    onClick,
  }: {
    children: React.ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: ({
    children,
    dialogClassName,
  }: {
    children: React.ReactNode;
    dialogClassName?: string;
  }) => <div data-dialog-class={dialogClassName}>{children}</div>,
  ProductModalBody: ({
    children,
    onSubmit,
  }: {
    children: React.ReactNode;
    onSubmit?: (event?: unknown) => void;
  }) => <form onSubmit={onSubmit}>{children}</form>,
  ProductModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ProductModalHeader: ({
    closeTitle,
    disabled,
    onClose,
    title,
  }: {
    closeTitle: string;
    disabled?: boolean;
    onClose?: () => void;
    title: string;
  }) => (
    <header>
      <span>{title}</span>
      <button disabled={disabled} onClick={onClose}>
        {closeTitle}
      </button>
    </header>
  ),
}));

vi.mock('./fields', () => ({
  PromptTemplateEditorFields: fieldsMock,
}));

import { PromptTemplateEditorContent } from './content';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
type EditorState = Parameters<typeof PromptTemplateEditorContent>[0]['state'];

function createState(overrides: Partial<EditorState> = {}): EditorState {
  const setContent: EditorState['fields']['setContent'] = vi.fn();
  const setErrors: EditorState['validation']['setErrors'] = vi.fn();
  const setName: EditorState['fields']['setName'] = vi.fn();

  return {
    actions: {
      handleKeyDown: vi.fn<EditorState['actions']['handleKeyDown']>(() => undefined),
      handleSubmit: vi.fn(async (_event?: React.FormEvent) => false),
    },
    fields: {
      content: '',
      name: '',
      nameInputRef: { current: null },
      setContent,
      setName,
    },
    validation: {
      errors: {},
      isDisabled: false,
      setErrors,
    },
    ...overrides,
  };
}

async function renderContent(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(node);
  });
}

function resetContentTestHarness() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fieldsMock.mockClear();
  translateMock.mockClear();
}

function cleanupContentTestHarness() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
}

async function verifyNewTemplateShell() {
  const onClose = vi.fn();
  const state = createState();

  await renderContent(
    <PromptTemplateEditorContent onClose={onClose} state={state} submitError={null} />
  );

  expect(container?.textContent).toContain('templates.editor.newTitle');
  expect(container?.textContent).toContain('common.actions.save');
  expect(container?.querySelector('.sniptale-error-text')).toBeNull();
  expect(fieldsMock).toHaveBeenCalledTimes(1);

  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  const cancelButton = buttons.find((button) => button.textContent === 'common.actions.cancel');
  const saveButton = buttons.find((button) => button.textContent === 'common.actions.save');

  await act(async () => {
    cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    saveButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    container
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  expect(onClose).toHaveBeenCalledTimes(1);
  expect(state.actions.handleSubmit).toHaveBeenCalledTimes(2);
}

async function verifyEditShell() {
  await renderContent(
    <PromptTemplateEditorContent
      isLoading
      onClose={vi.fn()}
      state={createState({
        validation: {
          ...createState().validation,
          isDisabled: true,
        },
      })}
      submitError="Save failed"
      template={{
        content: 'Prompt',
        id: 'template-1',
        name: 'Template',
      }}
    />
  );

  expect(container?.textContent).toContain('templates.editor.editTitle');
  expect(container?.textContent).toContain('common.states.saving...');
  expect(container?.textContent).toContain('Save failed');
  const buttons = [...(container?.querySelectorAll('button') ?? [])];
  expect(buttons.every((button) => button.disabled)).toBe(true);
}

describe('prompt template editor content', () => {
  beforeEach(resetContentTestHarness);
  afterEach(cleanupContentTestHarness);

  it('renders the new-template shell without submit errors', verifyNewTemplateShell);
  it('renders the edit shell, loading actions, and submit errors', verifyEditShell);
});
