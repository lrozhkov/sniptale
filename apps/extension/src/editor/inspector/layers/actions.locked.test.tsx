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

const LAYER: EditorLayerItem = {
  effectCount: 1,
  effects: [{ amount: 0.2, enabled: true, id: 'brightness' }],
  id: 'layer-1',
  locked: true,
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

function renderLockedActions() {
  const onOpenLayerEffects = vi.fn();
  const onRenameLayer = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <div>
        <LayerActionRail layer={LAYER as never} />
        <LayerExpandedActions
          autoNavigateSelectedLayer={false}
          editingName={false}
          isImmutable={false}
          layer={LAYER as never}
          visible
          onRenameLayer={onRenameLayer}
          onOpenLayerEffects={onOpenLayerEffects}
        />
      </div>
    )
  );
  return { onOpenLayerEffects, onRenameLayer };
}

function clickButtonTitle(title: string) {
  container?.querySelector<HTMLButtonElement>(`button[title="${title}"]`)?.click();
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('locked layer actions', () => {
  it('disables visibility and layer mutations while keeping unlock available', () => {
    const { onOpenLayerEffects, onRenameLayer } = renderLockedActions();

    expect(container?.querySelector('button[title="editor.toolbar.hideLayer"]')).toHaveProperty(
      'disabled',
      true
    );
    expect(container?.querySelector('button[title="editor.toolbar.unlockLayer"]')).toHaveProperty(
      'disabled',
      false
    );
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
      clickButtonTitle('editor.toolbar.hideLayer');
      clickButtonTitle('editor.toolbar.unlockLayer');
      clickButtonTitle('editor.toolbar.layerEffectsAdjustments');
      clickButtonTitle('editor.toolbar.renameLayer');
      clickButtonTitle('editor.toolbar.duplicateLayer');
      clickButtonTitle('editor.toolbar.deleteLayer');
    });

    expect(controllerMocks.toggleLayerVisibility).not.toHaveBeenCalled();
    expect(controllerMocks.toggleLayerLock).toHaveBeenCalledWith('layer-1');
    expect(onOpenLayerEffects).not.toHaveBeenCalled();
    expect(onRenameLayer).not.toHaveBeenCalled();
    expect(controllerMocks.duplicateSelection).not.toHaveBeenCalled();
    expect(controllerMocks.deleteSelection).not.toHaveBeenCalled();
  });
});
