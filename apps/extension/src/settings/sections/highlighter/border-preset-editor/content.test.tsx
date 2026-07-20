// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createBaseState,
  createPreset,
  type BorderPresetEditorTestState,
} from './content.test-support';

const { fieldsPropsSpy, modalPropsSpy } = vi.hoisted(() => ({
  fieldsPropsSpy: vi.fn(),
  modalPropsSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

type MockProductModalProps = React.HTMLAttributes<HTMLDivElement> & {
  accent?: string;
  children: React.ReactNode;
  isOpen?: boolean;
  maxHeight?: string;
  maxWidth?: string;
  onClose?: () => void;
  scrollable?: boolean;
  width?: string;
};

function MockProductModal({
  accent,
  children,
  isOpen,
  maxHeight,
  maxWidth,
  onClose,
  scrollable,
  width,
  ...props
}: MockProductModalProps) {
  modalPropsSpy({
    accent,
    isOpen,
    maxHeight,
    maxWidth,
    onClose,
    scrollable,
    width,
    ...props,
  });
  return isOpen ? <div data-testid="product-modal">{children}</div> : null;
}

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: ({
    children,
    onClick,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: MockProductModal,
  ProductModalBody: ({
    children,
    compact: _compact,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }) => (
    <div data-testid="product-modal-body" {...props}>
      {children}
    </div>
  ),
  ProductModalFooter: ({
    children,
    compact: _compact,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { compact?: boolean }) => (
    <div data-testid="product-modal-footer" {...props}>
      {children}
    </div>
  ),
  ProductModalHeader: ({
    compact: _compact,
    onClose,
    title,
  }: {
    compact?: boolean;
    onClose?: () => void;
    title: string;
  }) => (
    <header>
      <span>{title}</span>
      <button type="button" onClick={onClose}>
        close
      </button>
    </header>
  ),
}));

vi.mock('./fields', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fields')>()),
  BorderPresetEditorFields: (props: unknown) => {
    fieldsPropsSpy(props);
    return <div data-testid="border-preset-editor-fields">fields</div>;
  },
}));

import { BorderPresetEditorContent } from './content';

type EditorState = BorderPresetEditorTestState;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createState(overrides: Partial<EditorState> = {}): EditorState {
  return {
    ...createBaseState(),
    ...overrides,
  };
}

async function renderComponent(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

function createButtons() {
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);

  return {
    cancelButton: buttons.find((button) => button.textContent?.includes('common.actions.cancel')),
    createButton: buttons.find((button) =>
      button.textContent?.includes('highlighter.editor.createButton')
    ),
    headerCloseButton: buttons.find((button) => button.textContent === 'close'),
    saveButton: buttons.find((button) => button.textContent?.includes('common.actions.save')),
  };
}

function expectSharedModalState(state: EditorState) {
  expect(fieldsPropsSpy).toHaveBeenCalledWith({ state });
  expect(modalPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      accent: 'compact',
      isOpen: true,
      maxHeight: '88vh',
      maxWidth: '95vw',
      scrollable: true,
      width: '720px',
    })
  );
}

beforeEach(() => {
  fieldsPropsSpy.mockReset();
  modalPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

describe('BorderPresetEditorContent', () => {
  it('renders create-mode copy, passes state to fields, and disables save when invalid', async () => {
    const onClose = vi.fn();
    const state = createState({ hasBlockedProps: true, name: '  ' });

    await renderComponent(<BorderPresetEditorContent onClose={onClose} state={state} />);

    expect(container?.textContent).toContain('highlighter.editor.newTitle');
    expect(container?.textContent).toContain('highlighter.editor.createButton');
    expectSharedModalState(state);

    const { cancelButton, createButton } = createButtons();
    expect(createButton?.hasAttribute('disabled')).toBe(true);

    await act(async () => {
      cancelButton?.click();
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disables save when css validation reports an error', async () => {
    const state = createState({ cssError: 'shared.runtime.cssRecognitionFailed' });

    await renderComponent(<BorderPresetEditorContent onClose={vi.fn()} state={state} />);

    const { createButton } = createButtons();
    expect(createButton?.hasAttribute('disabled')).toBe(true);
  });
});

describe('BorderPresetEditorContent edit mode', () => {
  it('renders edit-mode copy and forwards save actions when the draft is valid', async () => {
    const onClose = vi.fn();
    const state = createState();

    await renderComponent(
      <BorderPresetEditorContent onClose={onClose} preset={createPreset()} state={state} />
    );

    expect(container?.textContent).toContain('highlighter.editor.editTitle');
    expect(container?.textContent).toContain('common.actions.save');

    const { headerCloseButton, saveButton } = createButtons();
    expect(saveButton?.hasAttribute('disabled')).toBe(false);

    await act(async () => {
      saveButton?.click();
      headerCloseButton?.click();
    });

    expect(state.handleSave).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
