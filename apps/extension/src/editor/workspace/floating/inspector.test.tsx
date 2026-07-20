import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  compactToolbar: vi.fn(() => <div data-ui="mock.compact-toolbar" />),
  confirmDialog: vi.fn(() => <div data-ui="mock.confirm-dialog" />),
  content: vi.fn(() => <div data-ui="mock.inspector-content" />),
  contentProps: vi.fn(() => ({ content: true })),
  hiddenInputs: vi.fn(() => <div data-ui="mock.hidden-inputs" />),
  layersPanel: vi.fn(() => <div data-ui="mock.layers-panel" />),
  layersProps: vi.fn(() => ({ layers: true })),
  useAppLocale: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: mocks.useAppLocale,
}));
vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>();
  return {
    ...actual,
    ProductConfirmDialog: mocks.confirmDialog,
  };
});
vi.mock('../../inspector/compact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../inspector/compact')>()),
  EditorInspectorCompactToolbar: mocks.compactToolbar,
}));
vi.mock('../../inspector/content', () => ({
  EditorInspectorContent: mocks.content,
}));
vi.mock('../../inspector/layers', () => ({
  EditorInspectorLayersPanel: mocks.layersPanel,
}));
vi.mock('../../inspector/sidebar/hidden-inputs', () => ({
  EditorInspectorSidebarHiddenInputs: mocks.hiddenInputs,
}));
vi.mock('../../inspector/sidebar-expanded-content/helpers', () => ({
  createEditorInspectorContentPanelProps: mocks.contentProps,
  createEditorInspectorLayersPanelProps: mocks.layersProps,
}));

function createController(overrides: Record<string, unknown> = {}) {
  return {
    backgroundImageInputRef: { current: null },
    compactCommandGroups: [],
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

type InspectorComponent = React.ComponentType<{
  documentController: unknown;
  hasImage: boolean;
  inspectorCollapsed: boolean;
  inspectorMeta: { subtitle: string; title: string };
  onCollapseInspector: () => void;
  onExpandInspector: () => void;
}>;

function renderInspector(
  EditorFloatingInspector: InspectorComponent,
  overrides: Record<string, unknown> = {}
) {
  return (
    <EditorFloatingInspector
      documentController={createController(overrides)}
      hasImage
      inspectorCollapsed={false}
      inspectorMeta={{ subtitle: 'Settings', title: 'Tool' }}
      onCollapseInspector={vi.fn()}
      onExpandInspector={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('splits inspector content and layers into separate floating panels', async () => {
  const { EditorFloatingInspector } = await import('./inspector');
  const markup = renderToStaticMarkup(
    renderInspector(EditorFloatingInspector as InspectorComponent)
  );

  expect(markup).toContain('editor.floating.inspector-panel');
  expect(markup).toContain('editor.floating.layers-panel');
  expect(markup).toContain('mock.inspector-content');
  expect(markup).toContain('mock.layers-panel');
  expect(mocks.hiddenInputs).toHaveBeenCalledOnce();
  expect(mocks.content).toHaveBeenCalledWith(expect.objectContaining({ content: true }), undefined);
  expect(mocks.layersPanel).toHaveBeenCalledWith(
    expect.objectContaining({ layers: true, maxExpandedHeightRatio: 1 }),
    undefined
  );
}, 10000);

it('renders the compact inspector toolbar when the inspector is collapsed', async () => {
  const { EditorFloatingInspector } = await import('./inspector');
  const Inspector = EditorFloatingInspector as InspectorComponent;
  const markup = renderToStaticMarkup(
    <Inspector
      documentController={createController()}
      hasImage
      inspectorCollapsed
      inspectorMeta={{ subtitle: 'Settings', title: 'Tool' }}
      onCollapseInspector={vi.fn()}
      onExpandInspector={vi.fn()}
    />
  );

  expect(markup).toContain('mock.compact-toolbar');
  expect(markup).not.toContain('mock.inspector-content');
  expect(mocks.compactToolbar).toHaveBeenCalledWith(
    expect.objectContaining({ collapsed: true }),
    undefined
  );
});

it('renders confirm dialogs from the shared document controller once', async () => {
  const confirmDialog = {
    cancelText: 'Cancel',
    confirmText: 'Close',
    message: 'Message',
    title: 'Title',
  };
  const { EditorFloatingInspector } = await import('./inspector');
  const markup = renderToStaticMarkup(
    renderInspector(EditorFloatingInspector as InspectorComponent, { confirmDialog })
  );

  expect(markup).toContain('mock.confirm-dialog');
  expect(mocks.content).toHaveBeenCalledWith(
    expect.objectContaining({ confirmDialog: null }),
    undefined
  );
  expect(mocks.confirmDialog).toHaveBeenCalledWith(
    expect.objectContaining(confirmDialog),
    undefined
  );
});
