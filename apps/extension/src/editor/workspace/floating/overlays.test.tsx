import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import type { EditorFloatingWorkspaceOverlaysController } from './overlays';

const mocks = vi.hoisted(() => ({
  confirmDialog: vi.fn(() => <div data-ui="mock.confirm-dialog" />),
  hiddenInputs: vi.fn(() => <div data-ui="mock.hidden-inputs" />),
}));

vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>();
  return {
    ...actual,
    ProductConfirmDialog: mocks.confirmDialog,
  };
});
vi.mock('../../inspector/sidebar/hidden-inputs', () => ({
  EditorInspectorSidebarHiddenInputs: mocks.hiddenInputs,
}));

function createController(
  overrides: Partial<EditorFloatingWorkspaceOverlaysController> = {}
): EditorFloatingWorkspaceOverlaysController {
  return {
    backgroundImageInputRef: { current: null },
    confirmDialog: null,
    handleBackgroundImageUpload: vi.fn(),
    importSessionInputRef: { current: null },
    onConfirmDialogCancel: vi.fn(),
    onConfirmDialogConfirm: vi.fn(),
    openImageInputRef: { current: null },
    setImageData: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('keeps hidden file inputs and the shared confirm dialog mounted outside panels', async () => {
  const confirmDialog = {
    cancelText: 'Cancel',
    confirmText: 'Close',
    message: 'Message',
    title: 'Title',
  };
  const { EditorFloatingWorkspaceOverlays } = await import('./overlays');
  const markup = renderToStaticMarkup(
    <EditorFloatingWorkspaceOverlays documentController={createController({ confirmDialog })} />
  );

  expect(markup).toContain('mock.hidden-inputs');
  expect(markup).toContain('mock.confirm-dialog');
  expect(mocks.hiddenInputs).toHaveBeenCalledOnce();
  expect(mocks.confirmDialog).toHaveBeenCalledWith(
    expect.objectContaining(confirmDialog),
    undefined
  );
}, 10000);

it('does not render a confirm dialog when the controller has no pending dialog', async () => {
  const { EditorFloatingWorkspaceOverlays } = await import('./overlays');
  const markup = renderToStaticMarkup(
    <EditorFloatingWorkspaceOverlays documentController={createController()} />
  );

  expect(markup).toContain('mock.hidden-inputs');
  expect(markup).not.toContain('mock.confirm-dialog');
});
