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
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
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

const layoutMetrics = {
  actionsHeight: 40,
  bodyClientHeight: 101,
  bodyOffsetHeight: 102,
  bodyScrollHeight: 100,
  headerHeight: 56,
  listClientHeight: 60,
  listScrollHeight: 60,
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

function setCompactLayerMetrics() {
  setLayoutMetricValues({
    bodyClientHeight: 101,
    bodyOffsetHeight: 102,
    listClientHeight: 60,
    listScrollHeight: 60,
  });
}

function setMediumLayerMetrics() {
  setLayoutMetricValues({
    bodyClientHeight: 101,
    bodyOffsetHeight: 102,
    listClientHeight: 90,
    listScrollHeight: 100,
  });
}

function setOverflowLayerMetrics() {
  setLayoutMetricValues({
    bodyClientHeight: 81,
    bodyOffsetHeight: 82,
    listClientHeight: 80,
    listScrollHeight: 260,
  });
}

function expectLastListViewport(args: { scrollable: boolean; reserveScrollbarGutter?: boolean }) {
  const expectedProps = {
    scrollable: args.scrollable,
    ...(args.reserveScrollbarGutter === undefined
      ? {}
      : { reserveScrollbarGutter: args.reserveScrollbarGutter }),
  };

  expect(mocks.listMock).toHaveBeenLastCalledWith(expect.objectContaining(expectedProps));
}

function getPanelFrame() {
  return container?.querySelector<HTMLDivElement>('[data-ui="editor.layers.panel-frame"]') ?? null;
}

function renderExpandedPanel(layerIds: string[], props: { maxExpandedHeightRatio?: number } = {}) {
  renderPanel(
    <EditorInspectorLayersPanel
      expanded
      layers={layerIds.map((id) => ({ id }) as never)}
      {...props}
      selectedObjectCount={1}
      draggedLayerId={null}
      dragOverLayerId={null}
      onOpenLayerEffects={vi.fn()}
    />
  );
}

function toggleHeader() {
  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="layers-header"]')?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  stubLayerHeightMeasurementEnvironment({
    getMetrics: () => layoutMetrics,
  });
  mocks.controller.reorderLayer.mockReset();
  mocks.headerMock.mockReset();
  mocks.listMock.mockReset();
  mocks.selectionActionsMock.mockReset();
  setLayoutMetricValues({
    actionsHeight: 40,
    bodyClientHeight: 101,
    bodyOffsetHeight: 102,
    bodyScrollHeight: 100,
    headerHeight: 56,
    listClientHeight: 60,
    listScrollHeight: 60,
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

it('grows below the cap without enabling list scrolling and only scrolls after hitting the cap', () => {
  renderExpandedPanel(['layer-1']);

  expect(getPanelFrame()?.style.height).toBe('157px');
  expectLastListViewport({ reserveScrollbarGutter: true, scrollable: false });

  setMediumLayerMetrics();
  renderExpandedPanel(['layer-1', 'layer-2']);

  expect(getPanelFrame()?.style.height).toBe('197px');
  expectLastListViewport({ reserveScrollbarGutter: true, scrollable: false });

  setOverflowLayerMetrics();
  renderExpandedPanel(['a', 'b', 'c']);

  expect(getPanelFrame()?.style.height).toBe('200px');
  expectLastListViewport({ reserveScrollbarGutter: true, scrollable: true });
  expect(getPanelFrame()?.className).toContain('flex-col');
  expect(getPanelFrame()?.className).toContain('overflow-hidden');
  expect(container?.querySelector('[data-ui="editor.layers.panel-body"]')?.className).toContain(
    'flex-1'
  );
});

it('freezes the measured height after deletion until the panel is collapsed and reopened', () => {
  setOverflowLayerMetrics();
  renderExpandedPanel(['layer-1', 'layer-2', 'layer-3']);

  expect(getPanelFrame()?.style.height).toBe('200px');
  expectLastListViewport({ scrollable: true });

  setCompactLayerMetrics();
  renderExpandedPanel(['layer-1']);

  expect(getPanelFrame()?.style.height).toBe('200px');
  expectLastListViewport({ scrollable: false });

  setOverflowLayerMetrics();
  renderExpandedPanel(['layer-1', 'layer-2', 'layer-3']);

  expect(getPanelFrame()?.style.height).toBe('200px');
  expectLastListViewport({ scrollable: true });

  toggleHeader();
  expect(container?.querySelector('[data-testid="layers-list"]')).toBeNull();

  setCompactLayerMetrics();
  toggleHeader();

  expect(getPanelFrame()?.style.height).toBe('157px');
  expectLastListViewport({ scrollable: false });
});

it('can use the full parent height for floating layer panels', () => {
  setOverflowLayerMetrics();
  renderExpandedPanel(['a', 'b', 'c'], { maxExpandedHeightRatio: 1 });

  expect(getPanelFrame()?.style.height).toBe('357px');
  expectLastListViewport({ reserveScrollbarGutter: true, scrollable: false });
});
