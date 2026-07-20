// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  bringForwardSelection: vi.fn(),
  bringSelectionToFront: vi.fn(),
  deleteSelection: vi.fn(),
  duplicateSelection: vi.fn(),
  mergeSelectedLayers: vi.fn(),
  sendBackwardSelection: vi.fn(),
  sendSelectionToBack: vi.fn(),
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
    <button
      type="button"
      title={props.title}
      disabled={props.disabled}
      data-danger={String(Boolean((props as { danger?: boolean }).danger))}
      onClick={props.onClick}
    >
      {props.title}
    </button>
  ),
}));

import { LayerSelectionActions } from './selection-actions';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

type SelectionActionProps = {
  layers: Array<{
    id: string;
    immutable?: boolean;
    locked?: boolean;
    selected?: boolean;
    type?: string;
  }>;
  selectedObjectCount: number;
};

function renderSelectionActions(props: SelectionActionProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      <LayerSelectionActions
        layers={props.layers as never}
        selectedObjectCount={props.selectedObjectCount}
      />
    );
  });
}

function getButtons() {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);
}

function getButton(title: string) {
  const button = getButtons().find((item) => item.title.startsWith(title));
  expect(button).toBeDefined();
  return button as HTMLButtonElement;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LayerSelectionActions layout', () => {
  it('renders reorder and mass-action groups in the confirmed order', () => {
    renderSelectionActions({
      layers: [
        { id: 'layer-1', immutable: false, selected: true, type: 'rectangle' },
        { id: 'layer-2', immutable: false, selected: true, type: 'ellipse' },
      ],
      selectedObjectCount: 2,
    });

    const groups = Array.from(
      container?.querySelectorAll<HTMLElement>('[data-ui^="editor.layers.selection-actions."]') ??
        []
    );
    expect(groups.map((group) => group.getAttribute('data-ui'))).toEqual([
      'editor.layers.selection-actions.reorder-group',
      'editor.layers.selection-actions.mass-group',
    ]);
    expect(groups[0]?.querySelectorAll('button')).toHaveLength(4);
    expect(groups[1]?.querySelectorAll('button')).toHaveLength(3);
  });
});

describe('LayerSelectionActions behavior routing', () => {
  it('routes every action through the controller', () => {
    renderSelectionActions({
      layers: [
        { id: 'layer-1', immutable: false, selected: true, type: 'rectangle' },
        { id: 'layer-2', immutable: false, selected: true, type: 'ellipse' },
      ],
      selectedObjectCount: 2,
    });

    act(() => {
      getButton('editor.toolbar.frontLayer').click();
      getButton('editor.toolbar.raiseSelection').click();
      getButton('editor.toolbar.lowerSelection').click();
      getButton('editor.toolbar.backLayer').click();
      getButton('editor.toolbar.mergeLayers').click();
      getButton('editor.toolbar.duplicateLayer').click();
      getButton('editor.toolbar.deleteLayer').click();
    });

    expect(controllerMocks.bringSelectionToFront).toHaveBeenCalledOnce();
    expect(controllerMocks.bringForwardSelection).toHaveBeenCalledOnce();
    expect(controllerMocks.sendBackwardSelection).toHaveBeenCalledOnce();
    expect(controllerMocks.sendSelectionToBack).toHaveBeenCalledOnce();
    expect(controllerMocks.mergeSelectedLayers).toHaveBeenCalledOnce();
    expect(controllerMocks.duplicateSelection).toHaveBeenCalledOnce();
    expect(controllerMocks.deleteSelection).toHaveBeenCalledOnce();
    expect(getButton('editor.toolbar.deleteLayer').getAttribute('data-danger')).toBe('true');
  });
});

describe('LayerSelectionActions disabled states', () => {
  it('disables all actions when nothing is selected', () => {
    renderSelectionActions({ layers: [], selectedObjectCount: 0 });

    expect(getButtons().every((button) => button.disabled)).toBe(true);
  });

  it('enables reorder, duplicate, and delete for a regular single-layer selection', () => {
    renderSelectionActions({
      layers: [{ id: 'layer-1', immutable: false, selected: true, type: 'rectangle' }],
      selectedObjectCount: 1,
    });

    expect(getButton('editor.toolbar.frontLayer').disabled).toBe(false);
    expect(getButton('editor.toolbar.raiseSelection').disabled).toBe(false);
    expect(getButton('editor.toolbar.lowerSelection').disabled).toBe(false);
    expect(getButton('editor.toolbar.backLayer').disabled).toBe(false);
    expect(getButton('editor.toolbar.mergeLayers').disabled).toBe(true);
    expect(getButton('editor.toolbar.duplicateLayer').disabled).toBe(false);
    expect(getButton('editor.toolbar.deleteLayer').disabled).toBe(false);
  });
});

describe('LayerSelectionActions source and locked rows', () => {
  it('keeps duplicate available and delete disabled for a source-image-only selection', () => {
    renderSelectionActions({
      layers: [{ id: 'source-image', immutable: true, selected: true, type: 'source-image' }],
      selectedObjectCount: 1,
    });

    expect(getButton('editor.toolbar.frontLayer').disabled).toBe(true);
    expect(getButton('editor.toolbar.duplicateLayer').disabled).toBe(false);
    expect(getButton('editor.toolbar.deleteLayer').disabled).toBe(true);
  });

  it('disables all mutation actions for a locked layer selection', () => {
    renderSelectionActions({
      layers: [
        { id: 'layer-1', immutable: false, locked: true, selected: true, type: 'rectangle' },
      ],
      selectedObjectCount: 1,
    });

    expect(getButton('editor.toolbar.frontLayer').disabled).toBe(true);
    expect(getButton('editor.toolbar.raiseSelection').disabled).toBe(true);
    expect(getButton('editor.toolbar.lowerSelection').disabled).toBe(true);
    expect(getButton('editor.toolbar.backLayer').disabled).toBe(true);
    expect(getButton('editor.toolbar.mergeLayers').disabled).toBe(true);
    expect(getButton('editor.toolbar.duplicateLayer').disabled).toBe(true);
    expect(getButton('editor.toolbar.deleteLayer').disabled).toBe(true);
  });
});
