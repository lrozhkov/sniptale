// @vitest-environment jsdom
import React from 'react';
import { Canvas, Rect } from 'fabric';
import { collectLayers } from '../../controller/document/layers';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import { afterEach, describe, expect, it, vi } from 'vitest';

const controllerMocks = vi.hoisted(() => ({
  deleteSelection: vi.fn(),
  duplicateSelection: vi.fn(),
  selectLayer: vi.fn(),
  rasterizeLayer: vi.fn(async () => true),
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
  EditorIconButton: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & { title: string; active?: boolean }
  ) => (
    <button
      type="button"
      title={props.title}
      data-active={String(Boolean(props.active))}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.title}
    </button>
  ),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
}));

import { LayerActionRail, LayerExpandedActions } from './actions';

const expandedActionsCommandTestTitle =
  'opens image adjustments and routes duplicate and delete ' +
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
          onOpenLayerEffects={onOpenLayerEffects}
        />
      </div>
    )
  );
  return { onOpenLayerEffects };
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
  clickButtonTitle('editor.toolbar.layerImageSettings');
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
  it('accents only hidden and locked states', () => {
    renderExpandedActions();
    expect(
      container
        ?.querySelector('button[title="editor.toolbar.hideLayer"]')
        ?.getAttribute('data-active')
    ).toBe('false');
    expect(
      container
        ?.querySelector('button[title="editor.toolbar.lockLayer"]')
        ?.getAttribute('data-active')
    ).toBe('false');
    act(() => root?.render(<LayerActionRail layer={{ ...LAYER, locked: true, visible: false }} />));
    expect(
      container
        ?.querySelector('button[title="editor.toolbar.showLayer"]')
        ?.getAttribute('data-active')
    ).toBe('true');
    expect(
      container
        ?.querySelector('button[title="editor.toolbar.unlockLayer"]')
        ?.getAttribute('data-active')
    ).toBe('true');
  });

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
    const { onOpenLayerEffects } = renderExpandedActions();

    act(() => {
      triggerExpandedActions();
    });

    expect(onOpenLayerEffects).toHaveBeenNthCalledWith(1, 'layer-1', 'adjustments', 'brightness', {
      focusViewport: false,
    });
    expect(onOpenLayerEffects).toHaveBeenCalledOnce();
    expect(container?.querySelector('button[title="editor.toolbar.renameLayer"]')).toBeNull();
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
      clickButtonTitle('editor.toolbar.layerImageSettings');
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
    const { onOpenLayerEffects } = renderExpandedActions({
      layer: { ...LAYER, locked: true },
    });

    expect(
      container?.querySelector('button[title="editor.toolbar.layerImageSettings"]')
    ).toHaveProperty('disabled', true);
    expect(container?.querySelector('button[title="editor.toolbar.renameLayer"]')).toBeNull();
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

it('rasterizes a vector layer before opening adjustments and exposes only one image action', async () => {
  const { onOpenLayerEffects } = renderExpandedActions({
    layer: { ...LAYER, type: 'text', raster: false },
  });
  for (const title of [
    'renameLayer',
    'layerEffectsAdjustments',
    'layerEffectsTransformations',
    'layerEffectsFilters',
  ])
    expect(container?.querySelector(`button[title="editor.toolbar.${title}"]`)).toBeNull();
  await act(async () => {
    clickButtonTitle('editor.toolbar.layerRasterizeAndAdjust');
  });
  expect(controllerMocks.rasterizeLayer).toHaveBeenCalledWith('layer-1');
  expect(controllerMocks.selectLayer).toHaveBeenCalledWith('layer-1', { focusViewport: false });
  expect(onOpenLayerEffects).toHaveBeenCalledOnce();
  expect(onOpenLayerEffects).toHaveBeenCalledWith('layer-1', 'adjustments', 'brightness', {
    focusViewport: false,
  });
});
it('waits for rasterization, rejects duplicate activation and keeps a failed conversion retryable', async () => {
  let resolve!: (value: boolean) => void;
  controllerMocks.rasterizeLayer.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const { onOpenLayerEffects } = renderExpandedActions({
    layer: { ...LAYER, type: 'text', raster: false },
  });
  act(() => {
    clickButtonTitle('editor.toolbar.layerRasterizeAndAdjust');
    clickButtonTitle('editor.toolbar.layerRasterizeAndAdjust');
  });
  expect(controllerMocks.rasterizeLayer).toHaveBeenCalledOnce();
  expect(onOpenLayerEffects).not.toHaveBeenCalled();
  await act(async () => {
    resolve(false);
  });
  expect(onOpenLayerEffects).not.toHaveBeenCalled();
  expect(container?.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => {
    clickButtonTitle('editor.toolbar.layerRasterizeFailed');
  });
  expect(controllerMocks.rasterizeLayer).toHaveBeenCalledTimes(2);
  expect(onOpenLayerEffects).toHaveBeenCalledOnce();
});
it('does not open corrections after the row is removed while conversion is pending', async () => {
  let resolve!: (value: boolean) => void;
  controllerMocks.rasterizeLayer.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const { onOpenLayerEffects } = renderExpandedActions({
    layer: { ...LAYER, type: 'text', raster: false },
  });
  act(() => clickButtonTitle('editor.toolbar.layerRasterizeAndAdjust'));
  act(() => root?.unmount());
  root = null;
  await act(async () => {
    resolve(true);
  });
  expect(onOpenLayerEffects).not.toHaveBeenCalled();
});
it('does not move the inspector back to a vector row that was deselected during conversion', async () => {
  let resolve!: (value: boolean) => void;
  controllerMocks.rasterizeLayer.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const layer = { ...LAYER, type: 'text' as const, raster: false };
  const { onOpenLayerEffects } = renderExpandedActions({ layer });
  act(() => clickButtonTitle('editor.toolbar.layerRasterizeAndAdjust'));
  act(() =>
    root?.render(
      <div className="group">
        <LayerActionRail layer={{ ...layer, selected: false }} />
        <LayerExpandedActions
          autoNavigateSelectedLayer={false}
          editingName={false}
          isImmutable={false}
          layer={{ ...layer, selected: false }}
          visible
          onOpenLayerEffects={onOpenLayerEffects}
        />
      </div>
    )
  );
  await act(async () => {
    resolve(true);
  });
  expect(onOpenLayerEffects).not.toHaveBeenCalled();
});

it.each([false, true])(
  'keeps the action retryable when selection or opening fails before conversion (raster=%s)',
  async (raster) => {
    const { onOpenLayerEffects } = renderExpandedActions({
      layer: { ...LAYER, raster, type: raster ? 'image' : 'text' },
    });
    if (raster)
      onOpenLayerEffects.mockImplementationOnce(() => {
        throw new Error('completion barrier failed');
      });
    else
      controllerMocks.selectLayer.mockImplementationOnce(() => {
        throw new Error('completion barrier failed');
      });
    await act(async () =>
      clickButtonTitle(
        raster ? 'editor.toolbar.layerImageSettings' : 'editor.toolbar.layerRasterizeAndAdjust'
      )
    );
    expect(container?.querySelector('[role="alert"]')).not.toBeNull();
    expect(
      container?.querySelector<HTMLButtonElement>(
        'button[title="editor.toolbar.layerRasterizeFailed"]'
      )?.disabled
    ).toBe(false);
    expect(controllerMocks.rasterizeLayer).not.toHaveBeenCalled();
    await act(async () => clickButtonTitle('editor.toolbar.layerRasterizeFailed'));
    expect(onOpenLayerEffects).toHaveBeenCalledTimes(raster ? 2 : 1);
  }
);

it('opens corrections directly for the actual collected managed image background', async () => {
  const canvas = new Canvas(undefined, { width: 16, height: 16, renderOnAddRemove: false });
  try {
    const background = new Rect({ width: 16, height: 16 });
    Object.assign(background, {
      sniptaleType: 'background',
      sniptaleRole: 'background',
      sniptaleId: 'managed-image-background',
      sniptaleBackgroundMode: 'image',
      sniptaleLocked: false,
    });
    canvas.add(background);
    canvas.setActiveObject(background);
    const row = collectLayers(canvas).find((layer) => layer.id === background.sniptaleId)!;
    const { onOpenLayerEffects } = renderExpandedActions({ layer: row });
    await act(async () => clickButtonTitle('editor.toolbar.layerImageSettings'));
    expect(onOpenLayerEffects).toHaveBeenCalledExactlyOnceWith(
      row.id,
      'adjustments',
      'brightness',
      { focusViewport: false }
    );
    expect(controllerMocks.rasterizeLayer).not.toHaveBeenCalled();
    expect(controllerMocks.selectLayer).not.toHaveBeenCalled();
  } finally {
    await canvas.dispose();
  }
});
