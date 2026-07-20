import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  content: vi.fn(() => <div data-ui="mock.inspector-content" />),
  contentProps: vi.fn(() => ({ content: true })),
  layersPanel: vi.fn(() => <div data-ui="mock.layers-panel" />),
  layersProps: vi.fn(() => ({ layers: true })),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock('../../inspector/content', () => ({
  EditorInspectorContent: mocks.content,
}));
vi.mock('../../inspector/layers', () => ({
  EditorInspectorLayersPanel: mocks.layersPanel,
}));
vi.mock('../../inspector/sidebar-expanded-content/helpers', () => ({
  createEditorInspectorContentPanelProps: mocks.contentProps,
  createEditorInspectorLayersPanelProps: mocks.layersProps,
}));

function createController(overrides: Record<string, unknown> = {}) {
  return {
    inspector: 'tool',
    setInspector: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('renders left drawer content from existing inspector props and closes without changing tool', async () => {
  const { EditorFloatingLeftDrawer } = await import('./left-drawer');
  const onClose = vi.fn();
  const markup = renderToStaticMarkup(
    <EditorFloatingLeftDrawer
      documentController={createController() as never}
      hasImage
      mode="shapes-and-lines"
      onClose={onClose}
    />
  );

  expect(markup).toContain('editor.floating.left-drawer.shapes-and-lines');
  expect(markup).toContain('text-[12px] font-bold uppercase');
  expect(markup).toContain('max-[720px]:bottom-[22rem]');
  expect(markup).toContain('max-[720px]:max-h-[min(70vh,calc(100vh-32.5rem))]');
  expect(markup).not.toContain('editor.tools.shapeLibrary');
  expect(markup).toContain('mock.inspector-content');
  expect(mocks.content).toHaveBeenCalledWith(
    expect.objectContaining({
      highlightedTool: 'shapes-and-lines',
      inspector: 'tool',
      richShapeSelection: null,
      selection: expect.objectContaining({ hasSelection: false, selectedObjectType: null }),
      showDocumentActions: false,
    }),
    undefined
  );
}, 10000);

it('renders compact utility content as a floating panel next to the tool rail', async () => {
  const { EditorFloatingUtilityPanel } = await import('./utility-panel');
  const markup = renderToStaticMarkup(
    <EditorFloatingUtilityPanel
      documentController={createController({ inspector: 'frame' }) as never}
      hasImage
      inspectorMeta={{ subtitle: 'Scene', title: 'Frame' }}
      mode="frame"
    />
  );

  expect(markup).toContain('editor.floating.utility-panel.frame');
  expect(markup).toContain('text-[12px] font-bold uppercase');
  expect(markup).not.toContain('Scene');
  expect(markup).toContain('mock.inspector-content');
  expect(markup).not.toContain('editor.floating.inspector-collapse-button');
  expect(mocks.content).toHaveBeenCalledWith(
    expect.objectContaining({
      inspector: 'frame',
      showDocumentActions: false,
    }),
    undefined
  );
});

it('keeps layers as the only right stack surface', async () => {
  const { EditorFloatingRightStack } = await import('./right-stack');
  const markup = renderToStaticMarkup(
    <EditorFloatingRightStack
      documentController={createController() as never}
      hasImage
      inspectorMeta={{ subtitle: 'Scene', title: 'Frame' }}
      layersCollapsed={false}
      layersHeightRatio={0.5}
      layersPreferenceError={null}
      onCollapseLayers={vi.fn()}
      onExpandLayers={vi.fn()}
      onLayersHeightRatioChange={vi.fn()}
    />
  );

  expect(markup).toContain('editor.floating.right-stack');
  expect(markup).toContain('editor.floating.layers-panel');
  expect(markup).toContain('mock.layers-panel');
  expect(markup).not.toContain('editor.floating.utility-panel');
  expect(mocks.layersPanel).toHaveBeenCalledWith(
    expect.objectContaining({ fillContainer: true, layers: true, maxExpandedHeightRatio: 1 }),
    undefined
  );
});
