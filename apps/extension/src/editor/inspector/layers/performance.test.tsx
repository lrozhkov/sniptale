// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import type { EditorLayerEffectsOpenHandler } from './types';

const observations = vi.hoisted(() => ({ rows: vi.fn() }));

vi.mock('./height', async () => {
  const { useRef } = await import('react');
  return {
    useLayerPanelHeight: () => ({
      actionsRef: useRef<HTMLDivElement | null>(null),
      bodyRef: useRef<HTMLDivElement | null>(null),
      frameRef: useRef<HTMLDivElement | null>(null),
      headerRef: useRef<HTMLDivElement | null>(null),
      listRef: useRef<HTMLDivElement | null>(null),
      expandedHeight: 200,
      scrollable: true,
    }),
  };
});
vi.mock('./frame', () => ({
  LayerPanelFrame: (props: {
    children: React.ReactNode;
    fillContainer: boolean;
    onCollapsePanel?: () => void;
    onToggle: () => void;
  }) => (
    <div data-fill-container={props.fillContainer}>
      <button data-collapse onClick={props.onCollapsePanel ?? props.onToggle}>
        collapse
      </button>
      {props.children}
    </div>
  ),
}));
vi.mock('./selection-actions', () => ({ LayerSelectionActions: () => null }));
vi.mock('./preview', () => ({
  LayerPreview: ({ layer }: { layer: EditorLayerItem }) => <span>{layer.name}</span>,
}));
vi.mock('./actions', () => ({
  LayerActionRail: ({ layer }: { layer: EditorLayerItem }) => {
    observations.rows(layer);
    return (
      <span data-row={layer.id}>
        {layer.selected ? 'selected' : 'unselected'}:{layer.effectCount}
      </span>
    );
  },
  LayerExpandedActions: (props: {
    layer: EditorLayerItem;
    visible: boolean;
    onOpenLayerEffects: EditorLayerEffectsOpenHandler;
  }) => (
    <button
      data-effect={props.layer.id}
      data-visible={props.visible}
      onClick={() => props.onOpenLayerEffects(props.layer.id, 'filters', 'blur')}
    >
      effects
    </button>
  ),
}));

import { EditorControllerProvider } from '../../application/controller-context';
import { createImageEditorController } from '../../controller';
import { translate, setLocalePreference } from '../../../platform/i18n';
import * as localeState from '../../../platform/i18n/locale/state';
import { useEditorStore } from '../../state/useEditorStore';
import { EditorInspectorLayersPanel } from './index';

let container: HTMLDivElement;
let root: Root;
let controller: ReturnType<typeof createImageEditorController>;

function createLayer(id: string): EditorLayerItem {
  return {
    id,
    name: id,
    type: 'shape',
    typeLabel: 'Shape',
    effects: [],
    effectCount: 0,
    locked: false,
    visible: true,
    selected: false,
    selectedCount: 0,
    raster: false,
    previewColor: '#ffffff',
    previewDataUrl: null,
    previewTransparent: false,
  };
}

function render(
  layers: EditorLayerItem[],
  onOpenLayerEffects: EditorLayerEffectsOpenHandler = vi.fn(),
  draggedLayerId: string | null = null,
  options: { fillContainer?: boolean; onCollapsePanel?: () => void } = {}
) {
  act(() =>
    root.render(
      <EditorControllerProvider controller={controller}>
        <EditorInspectorLayersPanel
          expanded
          layers={layers}
          selectedObjectCount={0}
          draggedLayerId={draggedLayerId}
          dragOverLayerId={null}
          onOpenLayerEffects={onOpenLayerEffects}
          {...options}
        />
      </EditorControllerProvider>
    )
  );
}

beforeEach(() => {
  controller = createImageEditorController();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  observations.rows.mockClear();
});

afterEach(async () => {
  act(() => root.unmount());
  container.remove();
  useEditorStore.getState().resetDocumentState();
  await setLocalePreference('en');
  vi.restoreAllMocks();
});

it('skips unchanged row work across panel rerenders and calls the latest committed effects handler', () => {
  const layers = [createLayer('a'), createLayer('b')];
  const first = vi.fn();
  render(layers, first);
  observations.rows.mockClear();
  const latest = vi.fn();
  render(layers, latest);
  expect(observations.rows).not.toHaveBeenCalled();
  act(() => container.querySelector<HTMLButtonElement>('[data-effect="a"]')!.click());
  expect(first).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledWith('a', 'filters', 'blur');
});

it('shares the existing list locale subscription across all memoized rows', () => {
  const subscribe = vi.spyOn(localeState, 'subscribeToLocaleChanges');
  render(Array.from({ length: 20 }, (_, index) => createLayer(String(index))));
  expect(subscribe).toHaveBeenCalledTimes(2);
});

it('retains optional overflow panel collapse and keeps row events available', () => {
  const collapse = vi.fn();
  const open = vi.fn();
  render([createLayer('a')], open, null, { fillContainer: true, onCollapsePanel: collapse });
  expect(container.querySelector('[data-fill-container="true"]')).not.toBeNull();
  act(() => container.querySelector<HTMLButtonElement>('[data-collapse]')!.click());
  expect(collapse).toHaveBeenCalledOnce();
  act(() => container.querySelector<HTMLButtonElement>('[data-effect="a"]')!.click());
  expect(open).toHaveBeenCalledWith('a', 'filters', 'blur');
});

it('renders a changed row while retaining its neighbours and responds to hover and rename state', () => {
  const layers = [createLayer('a'), createLayer('b')];
  const open = vi.fn();
  render(layers, open);
  observations.rows.mockClear();
  const changed = [
    {
      ...layers[0]!,
      selected: true,
      effects: [{ id: 'blur' as const, enabled: true, blur: 0.2 }],
      effectCount: 1,
    },
    layers[1]!,
  ];
  render(changed, open);
  expect(observations.rows.mock.calls.map(([layer]) => layer.id)).toEqual(['a']);
  expect(container.querySelector('[data-row="a"]')!.textContent).toBe('selected:1');
  const effect = container.querySelector<HTMLButtonElement>('[data-effect="a"]')!;
  act(() => effect.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
  expect(effect.dataset['visible']).toBe('true');
  const rename = vi.spyOn(controller, 'renameLayer').mockImplementation(() => undefined);
  act(() =>
    container
      .querySelector<HTMLButtonElement>('button[title="a"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  );
  const input = container.querySelector<HTMLInputElement>('input')!;
  expect(document.activeElement).toBe(input);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      'Renamed'
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  expect(rename).toHaveBeenCalledWith('a', 'Renamed');
});

it('updates memoized row translations and binds selection/drop to the replacement controller', async () => {
  await setLocalePreference('en');
  const layers = [createLayer('a'), createLayer('b')];
  const open = vi.fn();
  render(layers, open, 'a');
  const english = translate('editor.toolbar.toggleLayerSelection');
  expect(container.querySelector(`button[title="${english}"]`)).not.toBeNull();
  await act(async () => setLocalePreference('ru'));
  const russian = translate('editor.toolbar.toggleLayerSelection');
  expect(russian).not.toBe(english);
  expect(container.querySelector(`button[title="${russian}"]`)).not.toBeNull();
  const oldController = controller;
  const oldSelect = vi.spyOn(oldController, 'selectLayer').mockImplementation(() => undefined);
  const oldDrop = vi.spyOn(oldController, 'reorderLayer').mockImplementation(() => undefined);
  controller = createImageEditorController();
  const nextSelect = vi.spyOn(controller, 'selectLayer').mockImplementation(() => undefined);
  const nextDrop = vi.spyOn(controller, 'reorderLayer').mockImplementation(() => undefined);
  render(layers, open, 'a');
  act(() => container.querySelector<HTMLButtonElement>('button[title="b"]')!.click());
  expect(oldSelect).not.toHaveBeenCalled();
  expect(nextSelect).toHaveBeenCalledWith('b', expect.objectContaining({ focusViewport: false }));
  const trigger = container.querySelector<HTMLButtonElement>('button[title="b"]')!;
  act(() => trigger.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true })));
  expect(oldDrop).not.toHaveBeenCalled();
  expect(nextDrop).toHaveBeenCalledWith('a', 'b');
});
