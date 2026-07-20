// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { stubLayerHeightMeasurementEnvironment } from './height.test-support';

const mocks = vi.hoisted(() => ({
  controller: {
    reorderLayer: vi.fn(),
  },
  headerMock: vi.fn(),
  listMock: vi.fn(),
  selectionActionsMock: vi.fn(),
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal()),
  useEditorController: () => mocks.controller,
}));

vi.mock('./header', () => ({
  EditorInspectorLayersHeader: (props: {
    expanded: boolean;
    layerCount: number;
    onToggle: () => void;
  }) => {
    mocks.headerMock(props);
    return (
      <button type="button" data-testid="layers-header" onClick={props.onToggle}>
        {props.layerCount}:{props.expanded ? 'open' : 'closed'}
      </button>
    );
  },
  EditorInspectorLayersList: (props: {
    listRef?: React.Ref<HTMLDivElement>;
    onDrop: (targetLayerId: string) => void;
    reserveScrollbarGutter?: boolean;
    scrollable?: boolean;
  }) => {
    mocks.listMock(props);
    return (
      <div
        ref={props.listRef}
        data-scrollable={String(props.scrollable ?? false)}
        data-ui="editor.layers.list-viewport"
      >
        <button
          type="button"
          data-testid="layers-list"
          onClick={() => props.onDrop('target-layer')}
        >
          drop
        </button>
      </div>
    );
  },
}));

vi.mock('./selection-actions', () => ({
  LayerSelectionActions: (props: {
    layers: Array<{ id: string }>;
    selectedObjectCount: number;
  }) => {
    mocks.selectionActionsMock(props);
    return <div data-testid="layer-selection-actions" />;
  },
}));

import { EditorInspectorLayersPanel } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let resizeObserverCallback: (() => void) | null = null;

const layoutMetrics = {
  actionsHeight: 40,
  bodyClientHeight: 81,
  bodyOffsetHeight: 82,
  bodyScrollHeight: 180,
  headerHeight: 56,
  listClientHeight: 80,
  listScrollHeight: 260,
  parentHeight: 400,
};

function renderPanel(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<div data-testid="panel-parent">{node}</div>);
  });
}

function setLayoutMetricValues(values: Partial<typeof layoutMetrics>) {
  Object.assign(layoutMetrics, values);
}

function getPanelFrame() {
  return container?.querySelector<HTMLDivElement>('[data-ui="editor.layers.panel-frame"]') ?? null;
}

function renderExpandedPanel(layerIds: string[], props: { fillContainer?: boolean } = {}) {
  renderPanel(
    <EditorInspectorLayersPanel
      expanded
      {...props}
      layers={layerIds.map((id) => ({ id }) as never)}
      selectedObjectCount={1}
      draggedLayerId={null}
      dragOverLayerId={null}
      onOpenLayerEffects={vi.fn()}
    />
  );
}

function triggerResizeObserver() {
  act(() => {
    resizeObserverCallback?.();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  stubLayerHeightMeasurementEnvironment({
    getMetrics: () => layoutMetrics,
    resizeObserverCallbackRef: {
      get current() {
        return resizeObserverCallback;
      },
      set current(callback: (() => void) | null) {
        resizeObserverCallback = callback;
      },
    },
  });
  mocks.controller.reorderLayer.mockReset();
  mocks.headerMock.mockReset();
  mocks.listMock.mockReset();
  mocks.selectionActionsMock.mockReset();
  resizeObserverCallback = null;
  setLayoutMetricValues({
    actionsHeight: 40,
    bodyClientHeight: 81,
    bodyOffsetHeight: 82,
    bodyScrollHeight: 180,
    headerHeight: 56,
    listClientHeight: 80,
    listScrollHeight: 260,
    parentHeight: 400,
  });
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

function expectLayerListScrollable(scrollable: boolean) {
  expect(mocks.listMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      scrollable,
    })
  );
}

it('recomputes on resize while active and only clamps to the cap after delete freeze', () => {
  renderExpandedPanel(['a', 'b', 'c']);

  expect(getPanelFrame()?.style.height).toBe('200px');
  expect(mocks.listMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reserveScrollbarGutter: true,
      scrollable: true,
    })
  );

  setLayoutMetricValues({ parentHeight: 500 });
  triggerResizeObserver();
  expect(getPanelFrame()?.style.height).toBe('250px');
  expectLayerListScrollable(true);

  setLayoutMetricValues({
    bodyClientHeight: 61,
    bodyOffsetHeight: 62,
    listClientHeight: 60,
    listScrollHeight: 60,
  });
  renderExpandedPanel(['a']);

  expect(getPanelFrame()?.style.height).toBe('250px');
  expectLayerListScrollable(false);

  setLayoutMetricValues({ parentHeight: 320 });
  triggerResizeObserver();
  expect(getPanelFrame()?.style.height).toBe('160px');
  expectLayerListScrollable(false);

  setLayoutMetricValues({ parentHeight: 700 });
  triggerResizeObserver();
  expect(getPanelFrame()?.style.height).toBe('160px');
  expectLayerListScrollable(false);
});

it('does not subscribe to resize measurement for full-height floating panels', () => {
  renderExpandedPanel(['a', 'b', 'c'], { fillContainer: true });

  expect(resizeObserverCallback).toBeNull();
  expect(getPanelFrame()?.style.height).toBe('');
  expect(mocks.listMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      reserveScrollbarGutter: true,
      scrollable: true,
    })
  );
});

it('ignores resize callbacks when measured state is unchanged', () => {
  renderExpandedPanel(['a', 'b', 'c']);

  const listRenderCount = mocks.listMock.mock.calls.length;
  triggerResizeObserver();

  expect(mocks.listMock).toHaveBeenCalledTimes(listRenderCount);
  expect(getPanelFrame()?.style.height).toBe('200px');
  expectLayerListScrollable(true);
});
