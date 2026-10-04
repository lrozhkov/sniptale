// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorFloatingLayersPanel } from './layers-panel';

const mocks = vi.hoisted(() => ({
  editorController: {
    cancelCropMode: vi.fn(),
    clearSelection: vi.fn(),
    setActiveTool: vi.fn(),
    suspendToolMode: vi.fn(),
  },
  setActiveTool: vi.fn(),
  setInspector: vi.fn(),
  insertImage: vi.fn(() => <button data-ui="mock.insert-image" type="button" />),
  content: vi.fn(() => <div data-ui="mock.settings-content" />),
  layers: vi.fn(() => <div data-ui="mock.layers" />),
  layersProps: vi.fn(() => ({ layers: [] })),
  onExpand: vi.fn(),
  onCollapse: vi.fn(),
}));

vi.mock('../../application/controller-context', () => ({
  useEditorController: () => mocks.editorController,
}));

vi.mock('../../inspector/layers', () => ({ EditorInspectorLayersPanel: mocks.layers }));
vi.mock('../../inspector/content', () => ({ EditorInspectorContent: mocks.content }));
vi.mock('../../inspector/layers/file-input', () => ({
  LayerInsertImageControl: mocks.insertImage,
}));
vi.mock('../../inspector/sidebar-expanded-content/helpers', () => ({
  createEditorInspectorContentPanelProps: vi.fn(),
  createEditorInspectorLayersPanelProps: mocks.layersProps,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let toolbar: HTMLDivElement | null = null;
const initialViewport = useEditorStore.getState().viewport;

const onHeightRatioChangeMock = vi.fn();

function renderPanel(
  options: {
    collapsed?: boolean;
    heightRatio?: number | null;
    preferenceError?: string | null;
    inspector?: string;
  } = {}
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <EditorFloatingLayersPanel
        collapsed={options.collapsed ?? false}
        documentController={
          {
            inspector: options.inspector ?? 'tool',
            setActiveTool: mocks.setActiveTool,
            setInspector: mocks.setInspector,
          } as never
        }
        hasImage
        heightRatio={options.heightRatio ?? null}
        preferenceError={options.preferenceError ?? null}
        onCollapse={mocks.onCollapse}
        onExpand={mocks.onExpand}
        onHeightRatioChange={onHeightRatioChangeMock}
      />
    );
  });
}

function createPointerEvent(type: string, init: { clientY?: number; pointerId: number }) {
  const event = new Event(type, { bubbles: true }) as PointerEvent;
  Object.defineProperties(event, {
    clientY: { value: init.clientY ?? 0 },
    pointerId: { value: init.pointerId },
  });
  return event;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  onHeightRatioChangeMock.mockReset();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  toolbar?.remove();
  toolbar = null;
  useEditorStore.setState({ viewport: initialViewport });
  vi.unstubAllGlobals();
});

it('stops at the map navigator boundary whether the navigator is open or closed', () => {
  toolbar = document.createElement('div');
  toolbar.dataset['ui'] = 'editor.floating.view-controls';
  toolbar.getBoundingClientRect = vi.fn(() => ({ width: 240, bottom: 55 }) as DOMRect);
  document.body.appendChild(toolbar);
  useEditorStore.setState({
    viewport: { ...initialViewport, canvasWidth: 1920, canvasHeight: 1080 },
  });

  renderPanel({ heightRatio: 1 });
  const panel = container?.querySelector<HTMLElement>('[data-ui="editor.floating.layers-panel"]');
  expect(panel?.style.height).toBe('495px');

  const openMap = document.createElement('div');
  openMap.dataset['ui'] = 'editor.floating.view-controls.popover.map';
  toolbar.appendChild(openMap);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(panel?.style.height).toBe('495px');

  act(() => {
    useEditorStore.setState({
      viewport: { ...initialViewport, canvasWidth: 1080, canvasHeight: 1920 },
    });
  });
  expect(panel?.style.height).toBe('479px');
});

it('renders resizable expanded layers panel with the current layers content', () => {
  renderPanel();

  const panel = container?.querySelector<HTMLElement>('[data-ui="editor.floating.layers-panel"]');
  expect(panel?.style.height).toBe('320px');
  expect(
    container?.querySelector('[data-ui="editor.floating.layers.resize-handle"]')
  ).not.toBeNull();
  expect(mocks.layers).toHaveBeenCalledWith(
    expect.objectContaining({ expanded: true, fillContainer: true, maxExpandedHeightRatio: 1 }),
    undefined
  );
});

it('resizes the expanded layers panel within viewport bounds', () => {
  renderPanel();
  const handle = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.layers.resize-handle"]'
  );
  handle!.setPointerCapture = vi.fn();
  handle!.hasPointerCapture = vi.fn(() => true);
  handle!.releasePointerCapture = vi.fn();

  act(() => {
    handle?.dispatchEvent(createPointerEvent('pointerdown', { clientY: 300, pointerId: 1 }));
    window.dispatchEvent(createPointerEvent('pointermove', { clientY: 0, pointerId: 1 }));
    window.dispatchEvent(createPointerEvent('pointerup', { pointerId: 1 }));
  });

  const panel = container?.querySelector<HTMLElement>('[data-ui="editor.floating.layers-panel"]');
  expect(panel?.style.height).toBe('516px');
  expect(handle?.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(onHeightRatioChangeMock).toHaveBeenCalledWith(1);
});

it('restores the expanded layers panel from a relative viewport height', () => {
  renderPanel({ heightRatio: 0.5 });

  const panel = container?.querySelector<HTMLElement>('[data-ui="editor.floating.layers-panel"]');
  expect(panel?.style.height).toBe('258px');
});

it('moves collapsed layers to the bottom-right toolbar without insert image action', () => {
  renderPanel({ collapsed: true });

  const toolbar = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.layers-collapsed-toolbar"]'
  );
  expect(toolbar).not.toBeNull();
  expect(toolbar?.parentElement?.className).toContain('pointer-events-auto');
  expect(toolbar?.querySelector('[role="toolbar"]')?.className).toContain('flex-row');
  expect(container?.querySelector('[data-ui="mock.insert-image"]')).toBeNull();
  expect(container?.querySelectorAll('[data-ui^="editor.floating.layers.mode."]')).toHaveLength(6);
});

it('keeps collapsed modes visually inactive while preserving selection for expansion', () => {
  renderPanel({ collapsed: true, inspector: 'frame' });

  expect(
    container
      ?.querySelector('[data-ui="editor.floating.layers.mode.frame"]')
      ?.getAttribute('aria-pressed')
  ).toBe('false');
  expect(container?.querySelector('[aria-pressed="true"]')).toBeNull();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.layers.mode.meta"]')
      ?.click();
  });

  expect(mocks.editorController.setActiveTool).toHaveBeenCalledWith('select');
  expect(mocks.setInspector).toHaveBeenCalledWith('meta');
  expect(mocks.onExpand).toHaveBeenCalledOnce();
});

it('expands when the already selected collapsed mode is clicked', () => {
  renderPanel({ collapsed: true, inspector: 'frame' });

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.layers.mode.frame"]')
      ?.click();
  });

  expect(mocks.setInspector).not.toHaveBeenCalled();
  expect(mocks.onExpand).toHaveBeenCalledOnce();
});

it('renders only the selected settings body instead of the layers list', () => {
  renderPanel({ inspector: 'browser-frame' });

  const settings = container?.querySelector('[data-ui="mock.settings-content"]');
  expect(settings).not.toBeNull();
  expect(settings?.parentElement?.className).toContain('overflow-y-auto');
  expect(container?.querySelector('[data-ui="mock.layers"]')).toBeNull();
  expect(mocks.content).toHaveBeenCalledWith(
    expect.objectContaining({
      confirmDialog: null,
      inspector: 'browser-frame',
      showDocumentActions: false,
    }),
    undefined
  );
});

it('cancels an active crop session before returning to layers', () => {
  renderPanel({ inspector: 'canvas-size' });

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.layers.mode.layers"]')
      ?.click();
  });

  expect(mocks.editorController.cancelCropMode).toHaveBeenCalledOnce();
  expect(mocks.setInspector).toHaveBeenCalledWith('tool');
});

it('renders preference save errors inline for expanded layers controls', () => {
  renderPanel({ preferenceError: 'Could not save panel' });

  expect(
    container?.querySelector('[data-ui="editor.floating.layers.preference-error"]')?.textContent
  ).toBe('Could not save panel');
});

it('renders preference save errors inline for collapsed layers controls', () => {
  renderPanel({ collapsed: true, preferenceError: 'Could not save collapsed state' });

  expect(
    container?.querySelector('[data-ui="editor.floating.layers.preference-error"]')?.textContent
  ).toBe('Could not save collapsed state');
});

it('replaces the list with inline effects and returns through the layers navigation', () => {
  renderPanel({ inspector: 'layer-effects' });
  expect(
    container?.querySelector<HTMLElement>('[data-ui="editor.floating.layers-panel"]')?.style.height
  ).toBe('516px');
  expect(container?.querySelector('[data-ui="mock.layers"]')).toBeNull();
  expect(
    container?.querySelector(
      '[data-ui="editor.floating.layers-panel"] [data-ui="editor.floating.layer-effects-panel"]'
    )
  ).not.toBeNull();
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.layer-effects-panel.back"]')
      ?.click()
  );
  expect(mocks.setInspector).toHaveBeenCalledWith('tool');
  mocks.setInspector.mockClear();
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.layers.mode.layers"]')
      ?.click()
  );
  expect(mocks.setInspector).toHaveBeenCalledWith('tool');
});

it.each(['canvas-size', 'frame', 'tool'])(
  'cancels crop only when collapsing the canvas-size panel, from %s',
  (inspector) => {
    renderPanel({ inspector });
    act(() => {
      container
        ?.querySelector<HTMLButtonElement>('[data-ui="editor.floating.layers.collapse-button"]')
        ?.click();
    });
    expect(mocks.onCollapse).toHaveBeenCalledOnce();
    expect(mocks.editorController.cancelCropMode).toHaveBeenCalledTimes(
      inspector === 'canvas-size' ? 1 : 0
    );
    if (inspector === 'canvas-size') {
      expect(mocks.setActiveTool).toHaveBeenCalledWith('select');
      expect(mocks.setInspector).toHaveBeenCalledWith('tool');
    } else {
      expect(mocks.setActiveTool).not.toHaveBeenCalled();
    }
  }
);
