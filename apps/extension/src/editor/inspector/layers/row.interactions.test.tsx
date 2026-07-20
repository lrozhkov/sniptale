// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({ selectLayer: vi.fn() }));

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
      const [editingName] = React.useState(layer.name === 'Editing Layer');
      return {
        cancel: vi.fn(),
        commit: vi.fn(),
        draftName: layer.name,
        editingName,
        inputRef: { current: null },
        setDraftName: vi.fn(),
        startEditing: vi.fn(),
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

function renderRow(layer: Record<string, unknown> = BASE_LAYER) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <LayerRow
        layer={layer as never}
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

it('hides expanded actions immediately when the pointer leaves the row', () => {
  renderRow();
  const row = container?.firstElementChild as HTMLDivElement | null;
  const expandedActions = container?.querySelector(
    '[data-testid="layer-expanded-actions"]'
  ) as HTMLDivElement | null;

  act(() => row?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  expect(expandedActions?.getAttribute('data-visible')).toBe('true');

  act(() => row?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
  expect(expandedActions?.getAttribute('data-visible')).toBe('false');
});

it('contains long layer names inside the middle slot while preserving the full title', () => {
  const longLayerName =
    'A very long imported screenshot layer name that should truncate before action buttons';
  renderRow({ ...BASE_LAYER, name: longLayerName });

  const trigger = container?.querySelector(
    `button[title="${longLayerName}"]`
  ) as HTMLButtonElement | null;
  const middleSlot = trigger?.parentElement as HTMLDivElement | null;

  expect(trigger?.title).toBe(longLayerName);
  expect(trigger?.className).toContain('min-w-0');
  expect(trigger?.className).toContain('w-full');
  expect(trigger?.className).toContain('overflow-hidden');
  expect(middleSlot?.className).toContain('min-w-0');
  expect(middleSlot?.className).toContain('w-full');
  expect(middleSlot?.className).toContain('overflow-hidden');
});

it('uses compact row shell tokens without changing the hover action structure', () => {
  renderRow();
  const row = container?.firstElementChild as HTMLDivElement | null;

  expect(row?.className).toContain('rounded-[10px]');
  expect(row?.className).toContain('var(--sniptale-color-surface-input)_62%');
  expect(row?.className).toContain('hover:border-[color:var(--sniptale-color-border-strong)]');
  expect(container?.querySelector('[data-testid="layer-action-rail"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="layer-expanded-actions"]')).not.toBeNull();
});

it('hides the layer title while inline actions are visible', () => {
  renderRow();
  const row = container?.firstElementChild as HTMLDivElement | null;
  const trigger = container?.querySelector('button[title="Layer 1"]') as HTMLButtonElement | null;

  act(() => row?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));

  expect(trigger?.className).toContain('pointer-events-none');
  expect(trigger?.textContent).toContain('Layer 1');
});

it('keeps the trigger non-button while editing so rename can own focus', () => {
  renderRow({ ...BASE_LAYER, name: 'Editing Layer' });

  expect(container?.querySelector('button[title="Editing Layer"]')).toBeNull();
  expect(
    container
      ?.querySelector('[data-testid="layer-expanded-actions"]')
      ?.getAttribute('data-editing-name')
  ).toBe('true');
});

it('uses plain, ctrl, and shift selection semantics from the layer preview', () => {
  renderRow();
  const preview = container?.querySelector<HTMLButtonElement>(
    'button[title="editor.toolbar.toggleLayerSelection"]'
  );

  act(() => {
    preview?.click();
  });
  expect(controllerMocks.selectLayer).toHaveBeenLastCalledWith('layer-1', {
    additive: false,
    focusViewport: false,
    range: false,
    toggle: false,
  });

  act(() => {
    preview?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  });
  expect(controllerMocks.selectLayer).toHaveBeenLastCalledWith('layer-1', {
    additive: true,
    focusViewport: false,
    range: false,
    toggle: true,
  });

  act(() => {
    preview?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  });
  expect(controllerMocks.selectLayer).toHaveBeenLastCalledWith('layer-1', {
    additive: false,
    focusViewport: false,
    range: true,
    toggle: false,
  });
});

it('uses the same single-select semantics from the layer row trigger', () => {
  renderRow();
  const trigger = container?.querySelector<HTMLButtonElement>('button[title="Layer 1"]');

  act(() => {
    trigger?.click();
  });

  expect(controllerMocks.selectLayer).toHaveBeenLastCalledWith('layer-1', {
    additive: false,
    focusViewport: false,
    range: false,
    toggle: false,
  });
});

it('passes modifier selection options from the layer row trigger', () => {
  renderRow();
  const trigger = container?.querySelector<HTMLButtonElement>('button[title="Layer 1"]');

  act(() => {
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
  });
  expect(controllerMocks.selectLayer).toHaveBeenLastCalledWith('layer-1', {
    additive: true,
    focusViewport: false,
    range: false,
    toggle: true,
  });

  act(() => {
    trigger?.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
  });
  expect(controllerMocks.selectLayer).toHaveBeenLastCalledWith('layer-1', {
    additive: false,
    focusViewport: false,
    range: true,
    toggle: false,
  });
});
