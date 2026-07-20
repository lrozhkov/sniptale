// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { useEditorInspectorLayerEffectsState } from './layer-effects-state';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type LayerEffectsHarnessProps = {
  inspector: string;
  layers: Array<{ id: string; name: string }>;
  setInspector: (inspector: string) => void;
  syncActiveTool: (tool: string) => void;
  selection: {
    hasSelection: boolean;
    selectedObjectCount: number;
    selectedObjectId: string | null;
    selectedObjectIds: string[];
  };
};

function renderHook(initialProps: LayerEffectsHarnessProps) {
  let value: ReturnType<typeof useEditorInspectorLayerEffectsState> | null = null;
  let props = initialProps;

  const Harness = () => {
    value = useEditorInspectorLayerEffectsState(props as never);
    return null;
  };

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<Harness />));

  return {
    getValue: () => value,
    rerender: (nextProps: LayerEffectsHarnessProps) => {
      props = nextProps;
      act(() => root?.render(<Harness />));
    },
  };
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('falls back to the single selected layer and supports explicit browser state updates', () => {
  const { getValue } = renderHook({
    inspector: 'tool',
    layers: [{ id: 'layer-1', name: 'Layer 1' }],
    setInspector: vi.fn(),
    syncActiveTool: vi.fn(),
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
    },
  });

  expect(getValue()?.layerEffectsState.layerId).toBe('layer-1');

  act(() => {
    getValue()?.openLayerEffects('layer-1', 'filters', 'blur');
  });

  expect(getValue()?.layerEffectsState).toEqual({
    activeEffectId: 'blur',
    category: 'filters',
    layerId: 'layer-1',
    query: '',
  });
});

it('falls back to the first layer when there is no single selected object', () => {
  const { getValue } = renderHook({
    inspector: 'tool',
    layers: [
      { id: 'layer-1', name: 'Layer 1' },
      { id: 'layer-2', name: 'Layer 2' },
    ],
    setInspector: vi.fn(),
    syncActiveTool: vi.fn(),
    selection: {
      hasSelection: true,
      selectedObjectCount: 2,
      selectedObjectId: null,
      selectedObjectIds: ['layer-1', 'layer-2'],
    },
  });

  expect(getValue()?.layerEffectsState.layerId).toBe('layer-1');
});

it('normalizes back to select when layer-effects loses the current single-layer selection', () => {
  const syncActiveTool = vi.fn();
  const setInspector = vi.fn();
  const { getValue, rerender } = renderHook({
    inspector: 'layer-effects',
    layers: [
      { id: 'layer-1', name: 'Layer 1' },
      { id: 'layer-2', name: 'Layer 2' },
    ],
    setInspector,
    syncActiveTool,
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
    },
  });

  act(() => {
    getValue()?.openLayerEffects('layer-1', 'filters', 'blur');
  });

  rerender({
    inspector: 'layer-effects',
    layers: [
      { id: 'layer-1', name: 'Layer 1' },
      { id: 'layer-2', name: 'Layer 2' },
    ],
    setInspector,
    syncActiveTool,
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-2',
      selectedObjectIds: ['layer-2'],
    },
  });

  expect(syncActiveTool).toHaveBeenCalledWith('select');
  expect(setInspector).toHaveBeenCalledWith('tool');
});

it('stays inert while layer-effects is not the active inspector branch', () => {
  const syncActiveTool = vi.fn();
  const { getValue, rerender } = renderHook({
    inspector: 'tool',
    layers: [
      { id: 'layer-1', name: 'Layer 1' },
      { id: 'layer-2', name: 'Layer 2' },
    ],
    setInspector: vi.fn(),
    syncActiveTool,
    selection: {
      hasSelection: true,
      selectedObjectCount: 1,
      selectedObjectId: 'layer-1',
      selectedObjectIds: ['layer-1'],
    },
  });

  act(() => {
    getValue()?.openLayerEffects('layer-1', 'filters', 'blur');
  });

  rerender({
    inspector: 'tool',
    layers: [
      { id: 'layer-1', name: 'Layer 1' },
      { id: 'layer-2', name: 'Layer 2' },
    ],
    setInspector: vi.fn(),
    syncActiveTool,
    selection: {
      hasSelection: false,
      selectedObjectCount: 0,
      selectedObjectId: null,
      selectedObjectIds: [],
    },
  });

  expect(syncActiveTool).not.toHaveBeenCalled();
});
