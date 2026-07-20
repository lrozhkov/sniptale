// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ViewportPreset } from '../../../../contracts/settings';
import type { ProductModalHeaderProps, ProductModalProps } from '@sniptale/ui/product-modal';

type EditorContentProps = {
  height: number;
  isDisabled: boolean;
  label: string;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  setHeight: React.Dispatch<React.SetStateAction<number>>;
  setLabel: React.Dispatch<React.SetStateAction<string>>;
  setWidth: React.Dispatch<React.SetStateAction<number>>;
  width: number;
};

type EditorFooterProps = {
  disabled: boolean;
  isSaving: boolean;
  label: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => Promise<void>;
  preset?: ViewportPreset;
};

const mocks = vi.hoisted(() => ({
  modalMock: vi.fn(),
  headerMock: vi.fn(),
  resolveTitleMock: vi.fn(() => 'Preset title'),
  useStateMock: vi.fn(() => ({
    handleKeyDown: vi.fn(),
    handleSubmit: vi.fn(),
    height: 720,
    isDisabled: false,
    isSaving: false,
    label: 'Desktop',
    setHeight: vi.fn(),
    setLabel: vi.fn(),
    setWidth: vi.fn(),
    width: 1280,
  })),
  contentMock: vi.fn(),
  footerMock: vi.fn(),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: ProductModalProps) => {
    mocks.modalMock(props);
    return <div data-testid="modal">{props.children}</div>;
  },
  ProductModalHeader: (props: ProductModalHeaderProps) => {
    mocks.headerMock(props);
    return <div data-testid="header">{props.title}</div>;
  },
}));

vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveViewportPresetEditorTitle: mocks.resolveTitleMock,
}));

vi.mock('./state', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state')>()),
  useViewportPresetEditorState: mocks.useStateMock,
}));

vi.mock('./views', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./views')>()),
  ViewportPresetEditorContent: (props: EditorContentProps) => {
    mocks.contentMock(props);
    return <div data-testid="content">content</div>;
  },
  ViewportPresetEditorFooter: (props: EditorFooterProps) => {
    mocks.footerMock(props);
    return <div data-testid="footer">footer</div>;
  },
}));

import { ViewportPresetEditor } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe('ViewportPresetEditor', () => {
  it('wires state and child views into the modal surface', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const preset = {
      id: 'desktop',
      label: 'Desktop',
      width: 1280,
      height: 720,
    } satisfies ViewportPreset;

    render(
      <ViewportPresetEditor isOpen onClose={onClose} onSave={onSave} preset={preset} isLoading />
    );

    expect(mocks.useStateMock).toHaveBeenCalledWith({
      isLoading: true,
      isOpen: true,
      onClose,
      onSave,
      preset,
    });
    expect(mocks.resolveTitleMock).toHaveBeenCalledWith(preset);
    expect(mocks.headerMock).toHaveBeenCalledWith(
      expect.objectContaining({ disabled: false, title: 'Preset title' })
    );
    expect(mocks.contentMock).toHaveBeenCalled();
    expect(mocks.footerMock).toHaveBeenCalled();
  });

  it('builds create-mode state args without an optional preset', () => {
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(<ViewportPresetEditor isOpen onClose={onClose} onSave={onSave} />);

    expect(mocks.useStateMock).toHaveBeenCalledWith({
      isLoading: false,
      isOpen: true,
      onClose,
      onSave,
    });
    expect(mocks.resolveTitleMock).toHaveBeenCalledWith(undefined);
  });
});
