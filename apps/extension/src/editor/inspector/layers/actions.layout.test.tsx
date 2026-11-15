// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  deleteSelection: vi.fn(),
  duplicateSelection: vi.fn(),
  selectLayer: vi.fn(),
  toggleLayerLock: vi.fn(),
  toggleLayerVisibility: vi.fn(),
  withHistoryMuted: vi.fn((callback: () => void) => callback()),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../application/controller-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../application/controller-context')>()),
  useEditorController: () => controllerMocks,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  EditorIconButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string }) => (
    <button type="button" title={props.title} disabled={props.disabled} onClick={props.onClick}>
      {props.title}
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { LayerExpandedActions } from './actions';
import { LayerRow } from './row';

const LAYER: EditorLayerItem = {
  effectCount: 1,
  effects: [{ amount: 0.2, enabled: true, id: 'brightness' }],
  id: 'layer-1',
  locked: false,
  name: 'Layer 1',
  previewColor: '#ffffff',
  previewDataUrl: null,
  previewTransparent: false,
  raster: true,
  selected: true,
  selectedCount: 1,
  type: 'image',
  typeLabel: 'Image',
  visible: true,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderExpandedActions(args?: {
  editingName?: boolean;
  layer?: EditorLayerItem;
  visible?: boolean;
}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <LayerExpandedActions
        autoNavigateSelectedLayer={false}
        editingName={args?.editingName ?? false}
        isImmutable={false}
        layer={(args?.layer ?? LAYER) as never}
        visible={args?.visible ?? true}
        onOpenLayerEffects={vi.fn()}
      />
    )
  );
}

function renderLayerRow(
  args: {
    layer?: EditorLayerItem;
    draggedLayerId?: string | null;
    onPointerStart?: (id: string, event: import('react').PointerEvent<HTMLButtonElement>) => void;
  } = {}
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <LayerRow
        locale="en"
        layer={(args.layer ?? LAYER) as never}
        draggedLayerId={args.draggedLayerId ?? null}
        onPointerStart={args.onPointerStart ?? vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />
    )
  );
}

function renderLockedLayerRow() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <LayerRow
        locale="en"
        layer={{ ...LAYER, locked: true } as never}
        onOpenLayerEffects={vi.fn()}
      />
    )
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('LayerExpandedActions visibility layout', () => {
  it('keeps actions beside the layer name without a duplicate hover label', () => {
    const longName = 'A very long imported screenshot layer name';
    renderExpandedActions({ layer: { ...LAYER, name: longName } });
    const menu = container?.querySelector('[data-ui="editor.layers.expanded-actions"]');
    const label = container?.querySelector('[data-ui="editor.layers.expanded-label"]');
    const row = container?.querySelector('[data-ui="editor.layers.expanded-actions-row"]');

    expect(menu?.className).toContain('shrink-0');
    expect(menu?.className).not.toContain('absolute');
    expect(label).toBeNull();
    expect(row?.className).toContain('items-center');
  });

  it('stays hidden while editing or until hover requests it', () => {
    renderExpandedActions({ editingName: true });
    expect(container?.querySelector('[data-ui="editor.layers.expanded-actions"]')).toBeNull();
    act(() => root?.unmount());
    renderExpandedActions({ visible: false });
    expect(
      container?.querySelector('[data-ui="editor.layers.expanded-actions"]')?.className
    ).toContain('hidden');
  });
});

it('routes row trigger clicks through single-selection semantics', () => {
  renderLayerRow();

  act(() => {
    container?.querySelector<HTMLButtonElement>('button[title="Layer 1"]')?.click();
  });

  expect(controllerMocks.selectLayer).toHaveBeenCalledWith('layer-1', {
    additive: false,
    focusViewport: false,
    range: false,
    toggle: false,
  });
});

it('routes row preview modifier clicks and keeps locked rows non-draggable', () => {
  renderLayerRow();
  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('button[aria-pressed]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  });
  expect(controllerMocks.selectLayer).toHaveBeenCalledWith('layer-1', {
    additive: true,
    focusViewport: false,
    range: false,
    toggle: true,
  });

  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  renderLockedLayerRow();
  expect(
    (container as HTMLDivElement | null)?.querySelector<HTMLButtonElement>(
      'button[title="Layer 1"]'
    )?.draggable
  ).toBe(false);
});

it('starts pointer reorder only from the selected icon handle', () => {
  const onPointerStart = vi.fn();
  renderLayerRow({ onPointerStart });
  const title = container!.querySelector<HTMLButtonElement>('button[title="Layer 1"]')!;
  const pointer = () => new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  act(() => title.dispatchEvent(pointer()));
  expect(onPointerStart).not.toHaveBeenCalled();
  const grip = container!.querySelector<HTMLButtonElement>(
    '[data-ui="editor.layers.drag-handle"]'
  )!;
  expect(grip.draggable).toBe(false);
  act(() => grip.dispatchEvent(pointer()));
  expect(onPointerStart).toHaveBeenCalledExactlyOnceWith('layer-1', expect.anything());
});

it('keeps the icon a selection control when the row is not selected', () => {
  const onPointerStart = vi.fn();
  renderLayerRow({ layer: { ...LAYER, selected: false }, onPointerStart });
  expect(container!.querySelector('[data-ui="editor.layers.drag-handle"]')).toBeNull();
  const icon = container!.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
  expect(icon.draggable).toBe(false);
  const drag = new Event('dragstart', { bubbles: true, cancelable: true });
  act(() => {
    icon.dispatchEvent(drag);
    icon.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  });
  expect(drag.defaultPrevented).toBe(true);
  expect(onPointerStart).not.toHaveBeenCalled();
});

it.each([
  { ...LAYER, locked: true },
  { ...LAYER, type: 'source-image' as const, immutable: true, locked: true },
])('refuses pointer reorder from a fixed or locked row', (layer) => {
  const onPointerStart = vi.fn();
  renderLayerRow({ layer, onPointerStart });
  expect(container!.querySelector('[data-ui="editor.layers.drag-handle"]')).toBeNull();
  act(() =>
    container!
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }))
  );
  expect(onPointerStart).not.toHaveBeenCalled();
});
