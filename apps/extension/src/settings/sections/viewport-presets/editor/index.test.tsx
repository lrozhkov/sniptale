// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { UserViewportPreset } from '../../../../contracts/settings';

const mocks = vi.hoisted(() => ({
  content: vi.fn(),
  footer: vi.fn(),
  header: vi.fn(),
  modal: vi.fn(),
  resolveTitle: vi.fn(() => 'Preset title'),
  useState: vi.fn(),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: React.PropsWithChildren<Record<string, unknown>>) => {
    mocks.modal(props);
    return <div>{props.children}</div>;
  },
  ProductModalHeader: (props: Record<string, unknown>) => {
    mocks.header(props);
    return <div />;
  },
}));
vi.mock('./helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers')>()),
  resolveViewportPresetEditorTitle: mocks.resolveTitle,
}));
vi.mock('./state', () => ({ useViewportPresetEditorState: mocks.useState }));
vi.mock('./views', () => ({
  ViewportPresetEditorContent: (props: Record<string, unknown>) => {
    mocks.content(props);
    return <div />;
  },
  ViewportPresetEditorFooter: (props: Record<string, unknown>) => {
    mocks.footer(props);
    return <div />;
  },
}));

import { ViewportPresetEditor } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.useState.mockReturnValue({
    form: {
      height: 720,
      label: 'Desktop',
      setHeight: vi.fn(),
      setLabel: vi.fn(),
      setTarget: vi.fn(),
      setWidth: vi.fn(),
      target: 'window',
      width: 1280,
    },
    handlers: { handleKeyDown: vi.fn(), handleSubmit: vi.fn() },
    status: { isDisabled: false, isSaving: false },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('wires edit mode through the modal, form, and footer role contracts', () => {
  const preset: UserViewportPreset = {
    enabled: true,
    height: 900,
    id: 'window-1',
    kind: 'user',
    name: 'Desktop',
    order: 0,
    target: 'window',
    width: 1440,
  };
  const onClose = vi.fn();
  const onSave = vi.fn();

  act(() =>
    root?.render(
      <ViewportPresetEditor isOpen onClose={onClose} onSave={onSave} preset={preset} isLoading />
    )
  );

  expect(mocks.useState).toHaveBeenCalledWith({
    isLoading: true,
    isOpen: true,
    onClose,
    onSave,
    preset,
  });
  expect(mocks.modal).toHaveBeenCalledWith(
    expect.objectContaining({ isOpen: true, width: '420px' })
  );
  expect(mocks.header).toHaveBeenCalledWith(
    expect.objectContaining({ disabled: false, title: 'Preset title' })
  );
  expect(mocks.content).toHaveBeenCalledWith(expect.objectContaining({ target: 'window' }));
  expect(mocks.footer).toHaveBeenCalledWith(expect.objectContaining({ preset }));
});

it('omits optional preset data in create mode', () => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  act(() => root?.render(<ViewportPresetEditor isOpen onClose={onClose} onSave={onSave} />));

  expect(mocks.useState).toHaveBeenCalledWith({
    isLoading: false,
    isOpen: true,
    onClose,
    onSave,
  });
  expect(mocks.resolveTitle).toHaveBeenCalledWith(undefined);
  expect(mocks.footer.mock.calls.at(-1)?.[0]).not.toHaveProperty('preset');
});
