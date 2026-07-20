// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorLayerItem } from '../../../features/editor/document/types';

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
    onCollapsePanel?: () => void;
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
  }) => {
    mocks.listMock(props);
    return (
      <div ref={props.listRef}>
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

function renderPanel(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function createLayerItem(id: string): EditorLayerItem {
  return {
    effectCount: 0,
    effects: [],
    id,
    locked: false,
    name: id,
    previewColor: null,
    previewDataUrl: null,
    previewTransparent: false,
    raster: false,
    selected: false,
    selectedCount: 0,
    type: 'rectangle',
    typeLabel: 'Rectangle',
    visible: true,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.controller.reorderLayer.mockReset();
  mocks.headerMock.mockReset();
  mocks.listMock.mockReset();
  mocks.selectionActionsMock.mockReset();
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

it('renders the collapsed panel without list content', () => {
  renderPanel(
    <EditorInspectorLayersPanel
      expanded={false}
      layers={[]}
      selectedObjectCount={0}
      draggedLayerId={null}
      dragOverLayerId={null}
      onOpenLayerEffects={vi.fn()}
    />
  );

  expect(mocks.headerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      expanded: false,
      layerCount: 0,
    })
  );
  expect(mocks.listMock).not.toHaveBeenCalled();
  expect(mocks.selectionActionsMock).not.toHaveBeenCalled();
});

it('reorders layers and clears controlled drag state when dropping onto another layer', () => {
  const setDraggedLayerId = vi.fn();
  const setDragOverLayerId = vi.fn();
  const targetLayer = createLayerItem('target-layer');

  renderPanel(
    <EditorInspectorLayersPanel
      expanded
      layers={[targetLayer]}
      selectedObjectCount={1}
      draggedLayerId="source-layer"
      dragOverLayerId={null}
      onOpenLayerEffects={vi.fn()}
      setExpanded={vi.fn()}
      setDraggedLayerId={setDraggedLayerId}
      setDragOverLayerId={setDragOverLayerId}
    />
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="layers-list"]')?.click();
  });

  expect(mocks.controller.reorderLayer).toHaveBeenCalledWith('source-layer', 'target-layer');
  expect(setDraggedLayerId).toHaveBeenCalledWith(null);
  expect(setDragOverLayerId).toHaveBeenCalledWith(null);
  expect(mocks.selectionActionsMock).toHaveBeenCalledWith({
    layers: [targetLayer],
    selectedObjectCount: 1,
  });
});

it('keeps the uncontrolled panel state in sync with header toggles', () => {
  renderPanel(
    <EditorInspectorLayersPanel
      expanded
      layers={[createLayerItem('same-layer')]}
      selectedObjectCount={0}
      draggedLayerId="same-layer"
      dragOverLayerId={null}
      onOpenLayerEffects={vi.fn()}
    />
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="layers-header"]')?.click();
  });

  expect(mocks.listMock).toHaveBeenCalledTimes(1);
  expect(mocks.headerMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expanded: false,
    })
  );
  expect(container?.querySelector('[data-testid="layers-list"]')).toBeNull();
});

it('skips reordering when the dragged layer matches the drop target', () => {
  renderPanel(
    <EditorInspectorLayersPanel
      expanded
      layers={[createLayerItem('target-layer')]}
      selectedObjectCount={0}
      draggedLayerId="target-layer"
      dragOverLayerId={null}
      onOpenLayerEffects={vi.fn()}
      setExpanded={vi.fn()}
      setDraggedLayerId={vi.fn()}
      setDragOverLayerId={vi.fn()}
    />
  );

  act(() => {
    container?.querySelector<HTMLButtonElement>('[data-testid="layers-list"]')?.click();
  });

  expect(mocks.controller.reorderLayer).not.toHaveBeenCalled();
});

it('forwards explicit collapse ownership to the header', () => {
  const onCollapsePanel = vi.fn();

  renderPanel(
    <EditorInspectorLayersPanel
      expanded
      layers={[]}
      selectedObjectCount={0}
      draggedLayerId={null}
      dragOverLayerId={null}
      onCollapsePanel={onCollapsePanel}
      onOpenLayerEffects={vi.fn()}
    />
  );

  const headerProps = mocks.headerMock.mock.calls[0]?.[0];
  headerProps.onCollapsePanel();

  expect(onCollapsePanel).toHaveBeenCalledOnce();
});
