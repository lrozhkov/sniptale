// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  selectLayer: vi.fn(),
}));
const editableNameMocks = vi.hoisted(() => ({
  startEditing: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => controllerMocks,
}));

vi.mock('./actions', () => ({
  LayerActionRail: () => <div data-testid="layer-action-rail" />,
  LayerExpandedActions: (props: Record<string, unknown>) => (
    <div
      data-editing-name={String(props['editingName'])}
      data-testid="layer-expanded-actions"
      data-visible={String(props['visible'])}
    />
  ),
}));

vi.mock('./editable-name', async () => {
  const React = await import('react');
  return {
    LayerName: (props: { layer: { name: string } }) => <span>{props.layer.name}</span>,
    useEditableLayerName: (layer: { name: string }) => {
      const [editingName, setEditingName] = React.useState(layer.name === 'Editing Layer');
      return {
        cancel: vi.fn(),
        commit: vi.fn(),
        draftName: layer.name,
        editingName,
        inputRef: { current: null },
        setDraftName: vi.fn(),
        startEditing: () => {
          editableNameMocks.startEditing();
          setEditingName(true);
        },
      };
    },
  };
});

vi.mock('./preview', () => ({
  LayerPreview: (props: { layer: { name: string } }) => <span>{props.layer.name}</span>,
}));

import { LayerRow } from './row';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const BASE_LAYER = {
  effectCount: 0,
  effects: [],
  id: 'layer-1',
  immutable: false,
  locked: false,
  name: 'Layer 1',
  previewColor: '#ffffff',
  previewDataUrl: null,
  previewTransparent: false,
  raster: true,
  selected: false,
  selectedCount: 1,
  type: 'image',
  typeLabel: 'Image',
  visible: true,
} as const;

function renderRow(layerName = 'Layer 1') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <LayerRow
        layer={{ ...BASE_LAYER, name: layerName } as never}
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />
    );
  });
}

beforeEach(() => {
  controllerMocks.selectLayer.mockReset();
  editableNameMocks.startEditing.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.useRealTimers();
});

it('toggles additive selection from the preview chip without modifiers', () => {
  renderRow();

  act(() => {
    container
      ?.querySelector('button[title="editor.toolbar.toggleLayerSelection"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(controllerMocks.selectLayer).toHaveBeenCalledWith('layer-1', {
    additive: false,
    focusViewport: false,
    range: false,
    toggle: false,
  });
});

it('routes row clicks through plain, additive, and range layer selection modes', () => {
  renderRow();
  const trigger = container?.querySelector('button[title="Layer 1"]');

  act(() => {
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  });

  expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(1, 'layer-1', {
    additive: false,
    focusViewport: false,
    range: false,
    toggle: false,
  });
  expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(2, 'layer-1', {
    additive: true,
    focusViewport: false,
    range: false,
    toggle: true,
  });
  expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(3, 'layer-1', {
    additive: false,
    focusViewport: false,
    range: true,
    toggle: false,
  });
});

it('passes enabled viewport navigation through layer selection actions', () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <LayerRow
        layer={BASE_LAYER as never}
        autoNavigateSelectedLayer
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />
    );
  });

  act(() => {
    container?.querySelector('button[title="Layer 1"]')?.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
      })
    );
    container
      ?.querySelector('button[title="editor.toolbar.toggleLayerSelection"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(1, 'layer-1', {
    additive: false,
    focusViewport: true,
    range: false,
    toggle: false,
  });
  expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(2, 'layer-1', {
    additive: false,
    focusViewport: true,
    range: false,
    toggle: false,
  });
});

it('starts inline renaming from the keyboard on the trigger button', () => {
  renderRow();

  act(() => {
    container?.querySelector('button[title="Layer 1"]')?.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
      })
    );
  });

  expect(editableNameMocks.startEditing).toHaveBeenCalledOnce();
});

it('forwards drag events for mutable layers', () => {
  const setDraggedLayerId = vi.fn();
  const setDragOverLayerId = vi.fn();
  const onDrop = vi.fn();

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <LayerRow
        layer={BASE_LAYER as never}
        dragOverLayerId={null}
        setDraggedLayerId={setDraggedLayerId as never}
        setDragOverLayerId={setDragOverLayerId as never}
        onDrop={onDrop}
        onOpenLayerEffects={vi.fn()}
      />
    );
  });

  const trigger = container?.querySelector('button[title="Layer 1"]') as HTMLButtonElement | null;
  const row = trigger?.parentElement as HTMLDivElement | null;
  const dragOverEvent = new Event('dragover', { bubbles: true });
  const dropEvent = new Event('drop', { bubbles: true });
  Object.defineProperty(dragOverEvent, 'preventDefault', { value: vi.fn() });
  Object.defineProperty(dropEvent, 'preventDefault', { value: vi.fn() });

  act(() => {
    trigger?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    row?.dispatchEvent(dragOverEvent);
    row?.dispatchEvent(dropEvent);
    trigger?.dispatchEvent(new Event('dragend', { bubbles: true }));
  });

  expect(trigger?.draggable).toBe(true);
  expect(setDraggedLayerId).toHaveBeenNthCalledWith(1, 'layer-1');
  expect(setDraggedLayerId).toHaveBeenNthCalledWith(2, null);
  expect(setDragOverLayerId).toHaveBeenNthCalledWith(1, 'layer-1');
  expect(setDragOverLayerId).toHaveBeenNthCalledWith(2, null);
  expect(onDrop).toHaveBeenCalledWith('layer-1');
});

it('keeps immutable rows non-draggable and skips drag updates', () => {
  renderRow('Immutable Layer');
  act(() => {
    root?.render(
      <LayerRow
        layer={
          { ...BASE_LAYER, id: 'source-image', immutable: true, name: 'Immutable Layer' } as never
        }
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />
    );
  });

  const trigger = container?.querySelector(
    'button[title="Immutable Layer"]'
  ) as HTMLButtonElement | null;

  expect(trigger?.draggable).toBe(false);
});
