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

import { LayerActionRail, LayerExpandedActions } from './actions';

const expandedActionsCommandTestTitle =
  'opens layer effects, restores rename, and routes duplicate and delete ' +
  'through muted single-layer selection';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

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

function renderExpandedActions(args?: {
  autoNavigateSelectedLayer?: boolean;
  editingName?: boolean;
  isImmutable?: boolean;
  layer?: EditorLayerItem;
  visible?: boolean;
}) {
  const onOpenLayerEffects = vi.fn();
  const onRenameLayer = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <div className="group">
        <LayerActionRail layer={(args?.layer ?? LAYER) as never} />
        <LayerExpandedActions
          autoNavigateSelectedLayer={args?.autoNavigateSelectedLayer ?? false}
          editingName={args?.editingName ?? false}
          isImmutable={args?.isImmutable ?? false}
          layer={(args?.layer ?? LAYER) as never}
          visible={args?.visible ?? true}
          onRenameLayer={onRenameLayer}
          onOpenLayerEffects={onOpenLayerEffects}
        />
      </div>
    )
  );
  return { onOpenLayerEffects, onRenameLayer };
}

function getButtons() {
  return Array.from(container?.querySelectorAll('button') ?? []);
}

function clickButtonTitle(title: string) {
  getButtons()
    .find((button) => button.title === title)
    ?.click();
}

function triggerExpandedActions() {
  clickButtonTitle('editor.toolbar.layerEffectsAdjustments');
  clickButtonTitle('editor.toolbar.layerEffectsTransformations');
  clickButtonTitle('editor.toolbar.layerEffectsFilters');
  clickButtonTitle('editor.toolbar.renameLayer');
  clickButtonTitle('editor.toolbar.duplicateLayer');
  clickButtonTitle('editor.toolbar.deleteLayer');
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('LayerActionRail', () => {
  it('keeps visibility and lock controls in the stable top rail', () => {
    renderExpandedActions();

    act(() => {
      clickButtonTitle('editor.toolbar.hideLayer');
      clickButtonTitle('editor.toolbar.lockLayer');
    });

    expect(controllerMocks.toggleLayerVisibility).toHaveBeenCalledWith('layer-1');
    expect(controllerMocks.toggleLayerLock).toHaveBeenCalledWith('layer-1');
  });

  it('switches rail labels for hidden and locked layers', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() =>
      root?.render(<LayerActionRail layer={{ ...LAYER, locked: true, visible: false } as never} />)
    );

    expect(container?.querySelector('button[title="editor.toolbar.showLayer"]')).not.toBeNull();
    expect(container?.querySelector('button[title="editor.toolbar.unlockLayer"]')).not.toBeNull();
  });

  it('keeps locked layers selectable but disables visibility while unlock stays available', () => {
    renderExpandedActions({ layer: { ...LAYER, locked: true } });

    expect(container?.querySelector('button[title="editor.toolbar.hideLayer"]')).toHaveProperty(
      'disabled',
      true
    );
    expect(container?.querySelector('button[title="editor.toolbar.unlockLayer"]')).toHaveProperty(
      'disabled',
      false
    );

    act(() => {
      clickButtonTitle('editor.toolbar.hideLayer');
      clickButtonTitle('editor.toolbar.unlockLayer');
    });

    expect(controllerMocks.toggleLayerVisibility).not.toHaveBeenCalled();
    expect(controllerMocks.toggleLayerLock).toHaveBeenCalledWith('layer-1');
  });
});

describe('LayerExpandedActions command routing', () => {
  it(expandedActionsCommandTestTitle, () => {
    const { onOpenLayerEffects, onRenameLayer } = renderExpandedActions();

    act(() => {
      triggerExpandedActions();
    });

    expect(onOpenLayerEffects).toHaveBeenNthCalledWith(1, 'layer-1', 'adjustments', 'brightness', {
      focusViewport: false,
    });
    expect(onOpenLayerEffects).toHaveBeenNthCalledWith(2, 'layer-1', 'transformations', null, {
      focusViewport: false,
    });
    expect(onOpenLayerEffects).toHaveBeenNthCalledWith(3, 'layer-1', 'filters', 'blur', {
      focusViewport: false,
    });
    expect(onRenameLayer).toHaveBeenCalledOnce();
    expect(controllerMocks.withHistoryMuted).toHaveBeenCalledTimes(2);
    expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(1, 'layer-1', {
      focusViewport: false,
    });
    expect(controllerMocks.selectLayer).toHaveBeenNthCalledWith(2, 'layer-1', {
      focusViewport: false,
    });
    expect(controllerMocks.duplicateSelection).toHaveBeenCalledOnce();
    expect(controllerMocks.deleteSelection).toHaveBeenCalledOnce();
  });
});

describe('LayerExpandedActions enabled states', () => {
  it('passes enabled auto-navigation to layer effect actions', () => {
    const { onOpenLayerEffects } = renderExpandedActions({ autoNavigateSelectedLayer: true });

    act(() => {
      clickButtonTitle('editor.toolbar.layerEffectsAdjustments');
    });

    expect(onOpenLayerEffects).toHaveBeenCalledWith('layer-1', 'adjustments', 'brightness', {
      focusViewport: true,
    });
  });

  it('disables duplicate and delete for immutable annotation layers', () => {
    renderExpandedActions({ isImmutable: true });

    expect(
      container?.querySelector('button[title="editor.toolbar.duplicateLayer"]')
    ).toHaveProperty('disabled', true);
    expect(container?.querySelector('button[title="editor.toolbar.deleteLayer"]')).toHaveProperty(
      'disabled',
      true
    );
  });
});

describe('LayerExpandedActions locked rows', () => {
  it('disables layer settings and mutations for locked layers', () => {
    const { onOpenLayerEffects, onRenameLayer } = renderExpandedActions({
      layer: { ...LAYER, locked: true },
    });

    expect(
      container?.querySelector('button[title="editor.toolbar.layerEffectsAdjustments"]')
    ).toHaveProperty('disabled', true);
    expect(container?.querySelector('button[title="editor.toolbar.renameLayer"]')).toHaveProperty(
      'disabled',
      true
    );
    expect(
      container?.querySelector('button[title="editor.toolbar.duplicateLayer"]')
    ).toHaveProperty('disabled', true);
    expect(container?.querySelector('button[title="editor.toolbar.deleteLayer"]')).toHaveProperty(
      'disabled',
      true
    );

    act(() => {
      triggerExpandedActions();
    });

    expect(onOpenLayerEffects).not.toHaveBeenCalled();
    expect(onRenameLayer).not.toHaveBeenCalled();
    expect(controllerMocks.duplicateSelection).not.toHaveBeenCalled();
    expect(controllerMocks.deleteSelection).not.toHaveBeenCalled();
  });
});

describe('LayerExpandedActions source image commands', () => {
  it('keeps duplicate available for immutable source-image rows', () => {
    renderExpandedActions({
      isImmutable: true,
      layer: { ...LAYER, id: 'source-image', type: 'source-image' },
    });

    act(() => {
      clickButtonTitle('editor.toolbar.duplicateLayer');
    });

    expect(
      container?.querySelector('button[title="editor.toolbar.duplicateLayer"]')
    ).toHaveProperty('disabled', false);
    expect(container?.querySelector('button[title="editor.toolbar.deleteLayer"]')).toHaveProperty(
      'disabled',
      true
    );
    expect(controllerMocks.withHistoryMuted).toHaveBeenCalledOnce();
    expect(controllerMocks.selectLayer).toHaveBeenCalledWith('source-image', {
      focusViewport: false,
    });
    expect(controllerMocks.duplicateSelection).toHaveBeenCalledOnce();
  });
});
