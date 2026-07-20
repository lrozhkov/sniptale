// @vitest-environment jsdom
/* eslint-disable max-lines-per-function --
   ownership proof keeps canvas context-menu interaction matrix in one seam-local file */
import { act } from 'react';
import type { FabricObject } from 'fabric';
import { describe, expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';

function getCanvasViewportZone() {
  return document
    .querySelector('canvas')
    ?.closest<HTMLElement>('[data-ui="editor.canvas.context-zone"]');
}

function getContextMenuText() {
  return document.querySelector('[data-ui="editor.canvas.context-menu"]')?.textContent ?? '';
}

async function renderCanvasWrapperWithController(
  controller: ReturnType<typeof createControllerMock>,
  hasImage = true
) {
  const { CanvasWrapper } = await import('.');
  renderWithController(<CanvasWrapper hasImage={hasImage} />, controller);
}

function asFabricObject(value: Record<string, unknown>) {
  return value as unknown as FabricObject;
}

function createCanvasContextMenuEmitter(
  overrides: Partial<{
    findTarget: (event: MouseEvent) => FabricObject | null;
    getActiveObject: () => FabricObject | null;
    getActiveObjects: () => FabricObject[];
  }> = {}
) {
  let contextMenuListener:
    | ((event: { e: MouseEvent; target?: FabricObject | null }) => void)
    | null = null;

  return {
    canvas: {
      findTarget: overrides.findTarget ?? vi.fn(() => null),
      getActiveObject: overrides.getActiveObject ?? vi.fn(() => null),
      getActiveObjects: overrides.getActiveObjects ?? vi.fn(() => []),
      off: vi.fn((eventName: string) => {
        if (eventName === 'contextmenu') {
          contextMenuListener = null;
        }
      }),
      on: vi.fn((eventName: string, listener: typeof contextMenuListener) => {
        if (eventName === 'contextmenu') {
          contextMenuListener = listener;
        }
      }),
    },
    fireContextMenu(event: MouseEvent) {
      contextMenuListener?.({ e: event });
    },
  };
}

describe('canvas wrapper context-menu ownership seam', () => {
  it('opens the blank-canvas menu and clears selection through muted history', async () => {
    const controller = createControllerMock();
    const emitter = createCanvasContextMenuEmitter();
    Object.assign(controller, { canvas: emitter.canvas });

    resetEditorStore({
      selection: {
        hasSelection: true,
        selectedObjectCount: 1,
        selectedObjectHeight: 120,
        selectedObjectId: 'layer-1',
        selectedObjectIds: ['layer-1'],
        selectedObjectType: 'rectangle',
        selectedObjectWidth: 160,
      },
      viewportPreviewOpen: false,
    });
    await renderCanvasWrapperWithController(controller);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: 48,
      clientY: 64,
    });

    await act(async () => emitter.fireContextMenu(event));

    expect(event.defaultPrevented).toBe(true);
    expect(controller.withHistoryMuted).toHaveBeenCalledOnce();
    expect(controller.clearSelection).toHaveBeenCalledOnce();
    expect(getContextMenuText()).toContain(`${translate('editor.toolbar.insertImage')}…`);
    expect(getContextMenuText()).toContain(translate('editor.toolbar.contextMenuView'));

    const viewButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === translate('editor.toolbar.contextMenuView')
    );
    await act(async () => {
      viewButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(getContextMenuText()).toContain(translate('editor.toolbar.fitToWindow'));
  });

  it('retargets right-click to the hovered object and opens the single-layer menu', async () => {
    const controller = createControllerMock();
    const emitter = createCanvasContextMenuEmitter({
      findTarget: vi.fn(() =>
        asFabricObject({
          sniptaleId: 'layer-2',
          sniptaleLocked: true,
          sniptaleType: 'rectangle',
          type: 'rect',
          visible: false,
        })
      ),
    });
    Object.assign(controller, { canvas: emitter.canvas });

    resetEditorStore({
      layers: [
        {
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
          selected: false,
          selectedCount: 0,
          type: 'rectangle',
          typeLabel: 'Rectangle',
          visible: true,
        },
        {
          effectCount: 0,
          effects: [],
          id: 'layer-2',
          immutable: false,
          locked: true,
          name: 'Layer 2',
          previewColor: '#00aa55',
          previewDataUrl: null,
          previewTransparent: false,
          raster: false,
          selected: false,
          selectedCount: 0,
          type: 'rectangle',
          typeLabel: 'Rectangle',
          visible: false,
        },
      ],
      selection: {
        hasSelection: true,
        selectedObjectCount: 1,
        selectedObjectHeight: 120,
        selectedObjectId: 'layer-1',
        selectedObjectIds: ['layer-1'],
        selectedObjectType: 'rectangle',
        selectedObjectWidth: 160,
      },
      viewportPreviewOpen: false,
    });
    await renderCanvasWrapperWithController(controller);

    await act(async () =>
      emitter.fireContextMenu(
        new MouseEvent('contextmenu', {
          bubbles: true,
          button: 2,
          cancelable: true,
          clientX: 52,
          clientY: 68,
        })
      )
    );

    expect(controller.withHistoryMuted).toHaveBeenCalledOnce();
    expect(controller.selectLayer).toHaveBeenCalledWith('layer-2');
    expect(getContextMenuText()).toContain(translate('editor.toolbar.duplicateLayer'));
    expect(getContextMenuText()).toContain(translate('editor.toolbar.showLayer'));
    expect(getContextMenuText()).toContain(translate('editor.toolbar.unlockLayer'));
  });

  it('opens the custom menu from the mounted fabric canvas context-menu seam', async () => {
    const controller = createControllerMock();
    const emitter = createCanvasContextMenuEmitter();
    Object.assign(controller, { canvas: emitter.canvas });

    resetEditorStore({ viewportPreviewOpen: false });
    await renderCanvasWrapperWithController(controller);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: 56,
      clientY: 72,
    });

    await act(async () => emitter.fireContextMenu(event));

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-ui="editor.canvas.context-menu"]')).not.toBeNull();
  });

  it('blocks right-click on blank viewport margins without opening the custom menu', async () => {
    const controller = createControllerMock();
    Object.assign(controller, {
      canvas: {
        findTarget: vi.fn(() => null),
        getActiveObject: vi.fn(() => null),
        getActiveObjects: vi.fn(() => []),
      },
    });

    resetEditorStore({ viewportPreviewOpen: false });
    await renderCanvasWrapperWithController(controller);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    });

    await act(async () => {
      getCanvasViewportZone()?.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-ui="editor.canvas.context-menu"]')).toBeNull();
    expect(controller.withHistoryMuted).not.toHaveBeenCalled();
  });

  it('keeps native context-menu ownership while inline text editing is active', async () => {
    const controller = createControllerMock();
    const emitter = createCanvasContextMenuEmitter({
      findTarget: vi.fn(() =>
        asFabricObject({
          isEditing: true,
          sniptaleId: 'text-layer',
          sniptaleType: 'text',
          type: 'textbox',
        })
      ),
      getActiveObject: vi.fn(() =>
        asFabricObject({
          isEditing: true,
          sniptaleId: 'text-layer',
          sniptaleType: 'text',
          type: 'textbox',
        })
      ),
    });
    Object.assign(controller, { canvas: emitter.canvas });

    resetEditorStore({ viewportPreviewOpen: false });
    await renderCanvasWrapperWithController(controller);

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      button: 2,
      cancelable: true,
      clientX: 40,
      clientY: 40,
    });

    await act(async () => emitter.fireContextMenu(event));

    expect(event.defaultPrevented).toBe(false);
    expect(document.querySelector('[data-ui="editor.canvas.context-menu"]')).toBeNull();
    expect(controller.withHistoryMuted).not.toHaveBeenCalled();
  });
});
