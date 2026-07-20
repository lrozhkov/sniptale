// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorFloatingLayersPanel } from './layers-panel';

const mocks = vi.hoisted(() => ({
  insertImage: vi.fn(() => <button data-ui="mock.insert-image" type="button" />),
  layers: vi.fn(() => <div data-ui="mock.layers" />),
  layersProps: vi.fn(() => ({ layers: [] })),
}));

vi.mock('../../inspector/layers', () => ({ EditorInspectorLayersPanel: mocks.layers }));
vi.mock('../../inspector/layers/file-input', () => ({
  LayerInsertImageControl: mocks.insertImage,
}));
vi.mock('../../inspector/sidebar-expanded-content/helpers', () => ({
  createEditorInspectorContentPanelProps: vi.fn(),
  createEditorInspectorLayersPanelProps: mocks.layersProps,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const onHeightRatioChangeMock = vi.fn();

function renderPanel(
  options: {
    collapsed?: boolean;
    heightRatio?: number | null;
    preferenceError?: string | null;
  } = {}
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <EditorFloatingLayersPanel
        collapsed={options.collapsed ?? false}
        documentController={{} as never}
        heightRatio={options.heightRatio ?? null}
        preferenceError={options.preferenceError ?? null}
        onCollapse={vi.fn()}
        onExpand={vi.fn()}
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
  vi.unstubAllGlobals();
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

it('moves collapsed layers to the bottom-right toolbar with insert image action', () => {
  renderPanel({ collapsed: true });

  expect(
    container?.querySelector('[data-ui="editor.floating.layers-collapsed-toolbar"]')
  ).not.toBeNull();
  expect(container?.querySelector('[data-ui="mock.insert-image"]')).not.toBeNull();
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
