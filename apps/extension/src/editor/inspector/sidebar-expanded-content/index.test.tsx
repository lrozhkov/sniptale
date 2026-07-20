// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sidebarExpandedMocks = vi.hoisted(() => ({
  content: vi.fn((_props: unknown) => <div data-testid="inspector-content">content</div>),
  contentProps: vi.fn((_hasImage: boolean, _controller: unknown) => ({ panel: 'content' })),
  layers: vi.fn((_props: unknown) => <div data-testid="layers-panel">layers</div>),
  layersProps: vi.fn((_controller: unknown) => ({ panel: 'layers' })),
}));

vi.mock('../content', () => ({
  EditorInspectorContent: (props: unknown) => {
    sidebarExpandedMocks.content(props);
    return <div data-testid="inspector-content">content</div>;
  },
}));

vi.mock('../layers', () => ({
  EditorInspectorLayersPanel: (props: unknown) => {
    sidebarExpandedMocks.layers(props);
    return <div data-testid="layers-panel">layers</div>;
  },
}));

vi.mock('./helpers', () => ({
  createEditorInspectorContentPanelProps: (hasImage: boolean, controller: unknown) =>
    sidebarExpandedMocks.contentProps(hasImage, controller),
  createEditorInspectorLayersPanelProps: (controller: unknown) =>
    sidebarExpandedMocks.layersProps(controller),
}));

import { EditorInspectorSidebarExpandedContent } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let resizeObserverCallback: (() => void) | null = null;

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

function stubResizeEnvironment() {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      constructor(callback: () => void) {
        resizeObserverCallback = callback;
      }

      disconnect() {}

      observe() {}

      unobserve() {}
    }
  );
}

function registerPanelPropsTest() {
  it('renders content and layers panels through helper-owned props', () => {
    const controller = { id: 'controller' };

    render(<EditorInspectorSidebarExpandedContent hasImage controller={controller as never} />);

    expect(sidebarExpandedMocks.contentProps).toHaveBeenCalledWith(true, controller);
    expect(sidebarExpandedMocks.layersProps).toHaveBeenCalledWith(controller);
    expect(sidebarExpandedMocks.content).toHaveBeenCalledWith({ panel: 'content' });
    expect(sidebarExpandedMocks.layers).toHaveBeenCalledWith({ panel: 'layers' });
    expect(container?.textContent).toContain('content');
    expect(container?.textContent).toContain('layers');
  });
}

function setScrollableOverflowGeometry(scrollContainer: HTMLDivElement) {
  Object.defineProperties(scrollContainer, {
    clientHeight: { configurable: true, value: 120 },
    clientWidth: { configurable: true, value: 180 },
    offsetWidth: { configurable: true, value: 196 },
    scrollHeight: { configurable: true, value: 220 },
  });
}

function registerScrollbarGutterTest() {
  it('keeps a stable scrollbar gutter without inline width compensation', () => {
    render(<EditorInspectorSidebarExpandedContent hasImage controller={{} as never} />);

    const scrollContainer = container?.querySelector<HTMLDivElement>('.overflow-y-auto');
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer?.className).toContain('[scrollbar-gutter:stable_both-edges]');
    expect(resizeObserverCallback).toBeNull();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();

    setScrollableOverflowGeometry(scrollContainer as HTMLDivElement);

    act(() => {
      resizeObserverCallback?.();
    });

    expect(scrollContainer?.querySelector('[style*="calc(100% +"]')).toBeNull();
  });
}

describe('inspector/sidebar-expanded-content', () => {
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    stubResizeEnvironment();
    sidebarExpandedMocks.content.mockClear();
    sidebarExpandedMocks.contentProps.mockClear();
    sidebarExpandedMocks.layers.mockClear();
    sidebarExpandedMocks.layersProps.mockClear();
    resizeObserverCallback = null;
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  registerPanelPropsTest();
  registerScrollbarGutterTest();
});
