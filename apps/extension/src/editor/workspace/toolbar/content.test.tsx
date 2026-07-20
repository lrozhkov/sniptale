// @vitest-environment jsdom

import { act, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorToolbarContentProps } from './types';

const toolbarMocks = vi.hoisted(() => ({
  canvasSection: vi.fn(),
  divider: vi.fn(),
  inspectorSummary: vi.fn(),
  primarySection: vi.fn(),
  rasterSection: vi.fn(),
  shell: vi.fn(),
  trailingControls: vi.fn(),
  undoSection: vi.fn(),
}));

vi.mock('./inspector-summary', () => ({
  EditorToolbarInspectorSummary: (props: unknown) => {
    toolbarMocks.inspectorSummary(props);
    return <div data-testid="inspector-summary" />;
  },
}));

vi.mock('./trailing-controls', () => ({
  EditorToolbarTrailingControls: (props: {
    onSetViewportPreviewOpenManually: (open: boolean) => void;
  }) => {
    toolbarMocks.trailingControls(props);
    return (
      <button
        type="button"
        data-testid="trailing-controls"
        onClick={() => props.onSetViewportPreviewOpenManually(true)}
      />
    );
  },
}));

vi.mock('./shared', () => ({
  EditorToolbarDivider: () => {
    toolbarMocks.divider();
    return <div data-testid="divider" />;
  },
  EditorToolbarShell: (props: PropsWithChildren) => {
    toolbarMocks.shell(props);
    return <section data-testid="toolbar-shell">{props.children}</section>;
  },
  EditorToolbarUndoSection: (props: unknown) => {
    toolbarMocks.undoSection(props);
    return <div data-testid="undo-section" />;
  },
}));

vi.mock('./sections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sections')>()),
  EditorToolbarCanvasSection: (props: { onActivateCrop: () => void }) => {
    toolbarMocks.canvasSection(props);
    return (
      <button type="button" data-testid="canvas-section" onClick={() => props.onActivateCrop()} />
    );
  },
  EditorToolbarPrimarySection: (props: unknown) => {
    toolbarMocks.primarySection(props);
    return <div data-testid="primary-section" />;
  },
  EditorToolbarRasterSection: (props: unknown) => {
    toolbarMocks.rasterSection(props);
    return <div data-testid="raster-section" />;
  },
}));

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

function createProps(
  overrides: Partial<EditorToolbarContentProps> = {}
): EditorToolbarContentProps {
  return {
    activeTool: 'crop',
    gridEnabled: true,
    hasImage: true,
    history: { canRedo: false, canUndo: true },
    inspector: 'frame',
    inspectorCollapsed: false,
    inspectorMeta: {
      subtitle: 'Frame settings',
      title: 'Frame',
    },
    isToolButtonActive: (tool) => tool === 'select',
    isToolMode: true,
    viewportPreviewOpen: false,
    zoomPercent: 125,
    onActivateTool: vi.fn(),
    onBeforeSelectionAwareAction: vi.fn(),
    onCollapseInspector: vi.fn(),
    onExpandInspector: vi.fn(),
    onSetViewportPreviewOpenManually: vi.fn(),
    onToggleInspector: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  toolbarMocks.canvasSection.mockClear();
  toolbarMocks.divider.mockClear();
  toolbarMocks.inspectorSummary.mockClear();
  toolbarMocks.primarySection.mockClear();
  toolbarMocks.rasterSection.mockClear();
  toolbarMocks.shell.mockClear();
  toolbarMocks.trailingControls.mockClear();
  toolbarMocks.undoSection.mockClear();
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

function expectForwardedLayoutProps(props: EditorToolbarContentProps) {
  expect(container?.querySelector('[data-testid="toolbar-shell"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="toolbar-primary-row"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="toolbar-secondary-row"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="raster-section"]')).not.toBeNull();
  expect(container?.querySelectorAll('[data-testid="divider"]').length).toBe(3);
  expect(container?.querySelector('[data-testid="file-input"]')).toBeNull();
  expect(container?.textContent).not.toContain('Сохранено');
  expect(toolbarMocks.inspectorSummary).toHaveBeenCalledWith(
    expect.objectContaining({
      inspectorCollapsed: props.inspectorCollapsed,
      subtitle: props.inspectorMeta.subtitle,
      title: props.inspectorMeta.title,
    })
  );
  expect(toolbarMocks.primarySection).toHaveBeenCalledWith(
    expect.objectContaining({
      activeInspector: props.inspector,
      activeTool: props.activeTool,
      hasImage: props.hasImage,
    })
  );
  expect(toolbarMocks.canvasSection).toHaveBeenCalledWith(
    expect.objectContaining({
      hasImage: props.hasImage,
      isCropActive: true,
    })
  );
  expect(toolbarMocks.undoSection).toHaveBeenCalledWith(
    expect.objectContaining({
      hasImage: props.hasImage,
      history: props.history,
    })
  );
  expect(toolbarMocks.trailingControls).toHaveBeenCalledWith(
    expect.objectContaining({
      gridEnabled: props.gridEnabled,
      viewportPreviewOpen: props.viewportPreviewOpen,
      zoomPercent: props.zoomPercent,
    })
  );
}

async function clickMockToolbarButtons() {
  const cropButton = container?.querySelector('[data-testid="canvas-section"]');
  const viewportButton = container?.querySelector('[data-testid="trailing-controls"]');

  await act(async () => {
    (cropButton as HTMLButtonElement | null)?.click();
    (viewportButton as HTMLButtonElement | null)?.click();
  });
}

it('composes the toolbar shell and forwards layout props to child sections', async () => {
  const { EditorToolbarContent } = await import('./content');
  const props = createProps();

  render(<EditorToolbarContent {...props} />);

  expectForwardedLayoutProps(props);
  await clickMockToolbarButtons();

  expect(props.onActivateTool).toHaveBeenCalledWith('crop');
  expect(props.onSetViewportPreviewOpenManually).toHaveBeenCalledWith(true);
});

it('marks crop as inactive when the toolbar is outside crop tool mode', async () => {
  const { EditorToolbarContent } = await import('./content');

  render(
    <EditorToolbarContent
      {...createProps({
        activeTool: 'select',
        inspectorCollapsed: true,
        isToolMode: false,
      })}
    />
  );

  expect(toolbarMocks.inspectorSummary).toHaveBeenCalledWith(
    expect.objectContaining({ inspectorCollapsed: true })
  );
  expect(toolbarMocks.canvasSection).toHaveBeenCalledWith(
    expect.objectContaining({ isCropActive: false })
  );
});
