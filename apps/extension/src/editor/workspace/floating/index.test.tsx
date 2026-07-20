import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

type FloatingToolRailProps = {
  activeTool?: string;
  leftDrawerOpen?: boolean;
  onActivateTool: (tool: string) => void;
};

type FloatingLeftDrawerProps = {
  mode?: string;
  onClose: () => void;
};

type FloatingRightStackProps = {
  documentController?: unknown;
  layersCollapsed: boolean;
  layersPreferenceError: string | null;
  onCollapseLayers: () => void;
  onExpandLayers: () => void;
};

const mocks = vi.hoisted(() => ({
  canvasToolbar: vi.fn(() => <div data-ui="mock.canvas-toolbar" />),
  documentBar: vi.fn(() => <div data-ui="mock.document-bar" />),
  leftDrawer: vi.fn((_props: FloatingLeftDrawerProps) => <div data-ui="mock.left-drawer" />),
  overlays: vi.fn(() => <div data-ui="mock.overlays" />),
  rightStack: vi.fn((_props: FloatingRightStackProps) => <div data-ui="mock.right-stack" />),
  toolProperties: vi.fn(() => <div data-ui="mock.tool-properties" />),
  toolRail: vi.fn((_props: FloatingToolRailProps) => <div data-ui="mock.tool-rail" />),
  layersPreference: { collapsed: false, error: null as string | null },
  useInspectorController: vi.fn(() => ({
    id: 'document-controller',
    inspector: 'tool',
    selection: { hasSelection: false },
    setInspector: vi.fn(),
  })),
  useToolbarController: vi.fn(),
  utilityPanel: vi.fn(() => <div data-ui="mock.utility-panel" />),
  viewControls: vi.fn(() => <div data-ui="mock.view-controls" />),
}));

vi.mock('../toolbar/use-controller', () => ({
  useEditorToolbarController: mocks.useToolbarController,
}));
vi.mock('../../inspector/sidebar-controller', () => ({
  resolveSidebarShapeTool: vi.fn((tool: string) => tool),
  useEditorInspectorSidebarController: mocks.useInspectorController,
}));
vi.mock('./document-bar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./document-bar')>()),
  EditorFloatingDocumentBar: mocks.documentBar,
  EditorFloatingDocumentController: undefined,
}));
vi.mock('./canvas-selection-toolbar', () => ({
  EditorCanvasSelectionToolbar: mocks.canvasToolbar,
}));
vi.mock('./left-drawer', () => ({
  EditorFloatingLeftDrawer: mocks.leftDrawer,
}));
vi.mock('./overlays', () => ({
  EditorFloatingWorkspaceOverlaysController: undefined,
  EditorFloatingWorkspaceOverlays: mocks.overlays,
}));
vi.mock('./right-stack', () => ({
  EditorFloatingRightStack: mocks.rightStack,
}));
vi.mock('./utility-panel', () => ({
  EditorFloatingUtilityPanel: mocks.utilityPanel,
}));
vi.mock('./tool-rail', () => ({
  EditorFloatingToolRail: mocks.toolRail,
}));
vi.mock('./tool-properties-rail', () => ({
  EditorFloatingToolPropertiesRail: mocks.toolProperties,
}));
vi.mock('./view-controls', () => ({
  EditorFloatingViewControls: mocks.viewControls,
}));
vi.mock('./preferences', () => ({
  useFloatingLayersPreferenceState: () => ({
    layersCollapsed: mocks.layersPreference.collapsed,
    layersHeightRatio: null,
    layersPreferenceError: mocks.layersPreference.error,
    setLayersCollapsed: (collapsed: boolean) => {
      mocks.layersPreference.collapsed = collapsed;
    },
    setLayersHeightRatio: vi.fn(),
  }),
}));

import { EditorFloatingWorkspace } from '.';

function createToolbarProps() {
  return {
    activeTool: 'select',
    hasImage: true,
    onActivateTool: vi.fn(),
  };
}

function assertDefined<T>(value: T | undefined): asserts value is T {
  expect(value).toBeDefined();
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.layersPreference.collapsed = false;
  mocks.layersPreference.error = null;
  mocks.useToolbarController.mockReturnValue(createToolbarProps());
});

it('renders document bar, tool rail, view controls, overlays, and right stack for loaded images', () => {
  const markup = renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);

  expect(markup).toContain('editor.floating-workspace');
  expect(markup).toContain('mock.document-bar');
  expect(markup).toContain('mock.tool-rail');
  expect(markup).toContain('mock.view-controls');
  expect(markup).toContain('mock.overlays');
  expect(markup).toContain('mock.right-stack');
  expect(markup).toContain('mock.tool-properties');
  expect(mocks.useToolbarController).toHaveBeenCalledWith(true);
  expect(mocks.useInspectorController).toHaveBeenCalledWith(true);
  expect(mocks.documentBar).toHaveBeenCalledWith(
    expect.objectContaining({
      documentController: expect.objectContaining({ id: 'document-controller' }),
    }),
    undefined
  );
  expect(mocks.toolRail).toHaveBeenCalledWith(
    expect.objectContaining({ activeTool: 'select' }),
    undefined
  );
  const railProps = mocks.toolRail.mock.lastCall?.[0];
  assertDefined(railProps);
  railProps.onActivateTool('rectangle');
  expect(mocks.useToolbarController.mock.results[0]?.value.onActivateTool).toHaveBeenCalledWith(
    'rectangle'
  );
  expect(mocks.viewControls).toHaveBeenCalledOnce();
  expect(mocks.rightStack).toHaveBeenCalledWith(
    expect.objectContaining({
      documentController: expect.objectContaining({ id: 'document-controller' }),
      layersCollapsed: false,
      layersPreferenceError: null,
      onCollapseLayers: expect.any(Function),
      onExpandLayers: expect.any(Function),
    }),
    undefined
  );
});

it('passes floating layers preference errors to the right stack inline surface', () => {
  mocks.layersPreference.error = 'Could not save the layers panel state.';

  renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);

  expect(mocks.rightStack).toHaveBeenCalledWith(
    expect.objectContaining({
      layersPreferenceError: 'Could not save the layers panel state.',
    }),
    undefined
  );
});

it('keeps document bar and tool rail mounted for an empty editor', () => {
  const markup = renderToStaticMarkup(<EditorFloatingWorkspace hasImage={false} />);

  expect(markup).toContain('mock.document-bar');
  expect(markup).toContain('mock.tool-rail');
  expect(markup).toContain('mock.overlays');
  expect(markup).not.toContain('mock.view-controls');
  expect(markup).not.toContain('mock.right-stack');
  expect(mocks.useToolbarController).toHaveBeenCalledWith(false);
  expect(mocks.useInspectorController).toHaveBeenCalledWith(false);
});

it('opens the left drawer and shifts the rail for routed tools', () => {
  mocks.useToolbarController.mockReturnValue({
    ...createToolbarProps(),
    activeTool: 'shapes-and-lines',
  });
  const markup = renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);

  expect(markup).toContain('mock.left-drawer');
  const drawerProps = mocks.leftDrawer.mock.lastCall?.[0];
  assertDefined(drawerProps);
  drawerProps.onClose();
  expect(mocks.useInspectorController.mock.results.at(-1)?.value.setInspector).toHaveBeenCalledWith(
    'tool'
  );
  expect(mocks.toolRail).toHaveBeenCalledWith(
    expect.objectContaining({ leftDrawerOpen: true }),
    undefined
  );
});

it('keeps the shape library drawer open while showing selected layer canvas toolbar', () => {
  mocks.useToolbarController.mockReturnValue({
    ...createToolbarProps(),
    activeTool: 'shape-library',
  });
  mocks.useInspectorController.mockReturnValue({
    id: 'document-controller',
    inspector: 'tool',
    selection: { hasSelection: true },
    setInspector: vi.fn(),
  });

  const markup = renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);

  expect(markup).toContain('mock.left-drawer');
  expect(markup).toContain('mock.canvas-toolbar');
  expect(mocks.leftDrawer).toHaveBeenCalledWith(
    expect.objectContaining({ mode: 'shape-library' }),
    undefined
  );
  expect(mocks.canvasToolbar).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: true }),
    undefined
  );
});

it('renders compact utility panels as a separate surface next to the rail', () => {
  mocks.useInspectorController.mockReturnValue({
    id: 'document-controller',
    inspector: 'frame',
    selection: { hasSelection: false },
    setInspector: vi.fn(),
  });
  const markup = renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);

  expect(markup).toContain('mock.utility-panel');
  expect(mocks.utilityPanel).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: 'frame',
      documentController: expect.objectContaining({ id: 'document-controller' }),
    }),
    undefined
  );
});

it('collapses and expands the floating layers surface through loaded surface callbacks', () => {
  renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);

  const expandedStackProps = mocks.rightStack.mock.lastCall?.[0];
  assertDefined(expandedStackProps);
  expect(expandedStackProps.layersCollapsed).toBe(false);

  expandedStackProps.onCollapseLayers();
  renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);
  expect(mocks.rightStack.mock.lastCall?.[0].layersCollapsed).toBe(true);

  expandedStackProps.onExpandLayers();
  renderToStaticMarkup(<EditorFloatingWorkspace hasImage />);
  expect(mocks.rightStack.mock.lastCall?.[0].layersCollapsed).toBe(false);
});
