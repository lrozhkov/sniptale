// @vitest-environment jsdom
import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../../../platform/i18n';
import { renderWithController } from '../../../../../../../tooling/test/harness/editor/ownership/shell-helpers';
import { CanvasContextMenu } from './';
import { EDITOR_CANVAS_CONTEXT_MENU_DATA_UI, type CanvasContextMenuController } from './types';

function createSingleLayer() {
  return {
    effectCount: 0,
    effects: [],
    id: 'layer-1',
    immutable: false,
    locked: false,
    name: 'Layer 1',
    previewColor: '#ff5500',
    previewDataUrl: null,
    previewTransparent: false,
    raster: false,
    selected: true,
    selectedCount: 1,
    type: 'rectangle' as const,
    typeLabel: 'Rectangle',
    visible: true,
  };
}

function createHistoryMute(): CanvasContextMenuController['withHistoryMuted'] {
  return ((callback: () => unknown) =>
    callback()) as CanvasContextMenuController['withHistoryMuted'];
}

function createController(): CanvasContextMenuController {
  return {
    applyLayerTransformation: vi.fn(async () => undefined),
    bringForwardSelection: vi.fn(),
    bringSelectionToFront: vi.fn(),
    canvas: null,
    clearSelection: vi.fn(),
    deleteSelection: vi.fn(),
    duplicateSelection: vi.fn(async () => undefined),
    mergeSelectedLayers: vi.fn(async () => undefined),
    resetZoom: vi.fn(),
    selectLayer: vi.fn(),
    sendBackwardSelection: vi.fn(),
    sendSelectionToBack: vi.fn(),
    toggleLayerLock: vi.fn(),
    toggleLayerVisibility: vi.fn(),
    withHistoryMuted: createHistoryMute(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomToFit: vi.fn(),
  };
}

function renderSingleSelectionMenu(controller: CanvasContextMenuController, onClose = vi.fn()) {
  renderWithController(
    <CanvasContextMenu
      controller={controller}
      layers={[createSingleLayer()]}
      onClose={onClose}
      onOpenImage={vi.fn()}
      state={{
        anchor: { x: 24, y: 24 },
        request: {
          kind: 'single',
          layer: {
            id: 'layer-1',
            immutable: false,
            locked: false,
            visible: true,
          },
        },
        style: { left: 24, top: 24 },
        submenuSide: 'right',
      }}
    />,
    controller as never
  );
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes(label)
  );
}

function hasButton(label: string) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).some((button) =>
    button.textContent?.includes(label)
  );
}

function createMouseOutEvent(relatedTarget: EventTarget | null) {
  return new MouseEvent('mouseout', {
    bubbles: true,
    ...(relatedTarget === null ? {} : { relatedTarget }),
  });
}

function dispatchEventWithTarget(type: string, target: EventTarget) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  document.dispatchEvent(event);
}

describe('canvas context-menu floating interaction ownership', () => {
  it('keeps submenu ownership while the pointer moves from the trigger into the cascade', async () => {
    const controller = createController();
    renderSingleSelectionMenu(controller);

    const arrangeTrigger = findButton(translate('editor.toolbar.contextMenuArrange'));

    await act(async () => {
      arrangeTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const submenuItem = findButton(translate('editor.toolbar.frontLayer'));
    const triggerShell = arrangeTrigger?.parentElement;

    await act(async () => {
      triggerShell?.dispatchEvent(createMouseOutEvent(submenuItem ?? null));
    });

    expect(hasButton(translate('editor.toolbar.frontLayer'))).toBe(true);
  });

  it('keeps the menu open for owned pointer and focus movement', () => {
    const controller = createController();
    const onClose = vi.fn();
    renderSingleSelectionMenu(controller, onClose);

    const menu = document.querySelector(
      `[data-ui="${EDITOR_CANVAS_CONTEXT_MENU_DATA_UI}"]`
    ) as HTMLDivElement;

    menu.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    menu.dispatchEvent(new Event('focusin', { bubbles: true, cancelable: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('dismisses the menu for outside focus and non-node pointer targets', () => {
    const controller = createController();
    const onClose = vi.fn();
    renderSingleSelectionMenu(controller, onClose);

    document.body.dispatchEvent(new Event('focusin', { bubbles: true, cancelable: true }));
    dispatchEventWithTarget('pointerdown', window);

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
