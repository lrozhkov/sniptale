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
        onRenameLayer={vi.fn()}
        onOpenLayerEffects={vi.fn()}
      />
    )
  );
}

function renderLayerRow(
  args: {
    layer?: EditorLayerItem;
    onDrop?: ReturnType<typeof vi.fn>;
    setDraggedLayerId?: ReturnType<typeof vi.fn>;
    setDragOverLayerId?: ReturnType<typeof vi.fn>;
  } = {}
) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <LayerRow
        layer={(args.layer ?? LAYER) as never}
        dragOverLayerId={null}
        setDraggedLayerId={(args.setDraggedLayerId ?? vi.fn()) as never}
        setDragOverLayerId={(args.setDragOverLayerId ?? vi.fn()) as never}
        onDrop={(args.onDrop ?? vi.fn()) as (targetLayerId: string) => void}
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
        layer={{ ...LAYER, locked: true } as never}
        dragOverLayerId={null}
        setDraggedLayerId={vi.fn() as never}
        setDragOverLayerId={vi.fn() as never}
        onDrop={vi.fn()}
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
  it('splits the hover label from the vertically centered action row', () => {
    const longName = 'A very long imported screenshot layer name';
    renderExpandedActions({ layer: { ...LAYER, name: longName } });
    const menu = container?.querySelector('[data-ui="editor.layers.expanded-actions"]');
    const label = container?.querySelector('[data-ui="editor.layers.expanded-label"]');
    const row = container?.querySelector('[data-ui="editor.layers.expanded-actions-row"]');

    expect(menu?.className).toContain('absolute');
    expect(label?.textContent).toBe(longName);
    expect(label?.className).toContain('truncate');
    expect(row?.className).toContain('-translate-y-1/2');
    expect(container?.textContent).not.toContain('Image · 1');
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
      ?.querySelector<HTMLButtonElement>('button[title="editor.toolbar.toggleLayerSelection"]')
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

it('keeps unlocked row drag handlers active and reports hover drop targets', () => {
  const setDraggedLayerId = vi.fn();
  const setDragOverLayerId = vi.fn();
  const onDrop = vi.fn();
  renderLayerRow({ onDrop, setDraggedLayerId, setDragOverLayerId });
  const row = container?.firstElementChild as HTMLDivElement | null;
  const trigger = container?.querySelector<HTMLButtonElement>('button[title="Layer 1"]');

  act(() => {
    trigger?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    row?.dispatchEvent(new Event('dragover', { bubbles: true }));
    row?.dispatchEvent(new Event('drop', { bubbles: true }));
  });

  expect(setDraggedLayerId).toHaveBeenCalledWith('layer-1');
  expect(setDragOverLayerId).toHaveBeenCalledWith('layer-1');
  expect(onDrop).toHaveBeenCalledWith('layer-1');
});
