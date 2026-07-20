// @vitest-environment jsdom
import { act } from 'react';
import type { FabricObject } from 'fabric';
import { expect, it, vi } from 'vitest';
import { translate } from '../../../platform/i18n';
import {
  createControllerMock,
  renderWithController,
  resetEditorStore,
} from '../../../../../../tooling/test/harness/editor/ownership/shell-helpers';

function getCanvasSurface() {
  return document.querySelector<HTMLElement>('[data-ui="editor.canvas.surface-hit-area"]');
}

function getCanvasViewportZone() {
  return document
    .querySelector('canvas')
    ?.closest<HTMLElement>('[data-ui="editor.canvas.context-zone"]');
}

function getContextMenuText() {
  return document.querySelector('[data-ui="editor.canvas.context-menu"]')?.textContent ?? '';
}

async function renderCanvasWrapper(
  controller: ReturnType<typeof createControllerMock>,
  hasImage = true
) {
  const { CanvasWrapper } = await import('.');
  renderWithController(<CanvasWrapper hasImage={hasImage} />, controller);
}

function createCanvasContextMenuEmitter() {
  let contextMenuListener:
    | ((event: { e: MouseEvent; target?: FabricObject | null }) => void)
    | null = null;

  return {
    canvas: {
      findTarget: vi.fn(() => null),
      getActiveObject: vi.fn(() => null),
      getActiveObjects: vi.fn(() => []),
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

it('delegates loaded-image surface right-click to the fabric seam', async () => {
  const controller = createControllerMock();
  const emitter = createCanvasContextMenuEmitter();
  Object.assign(controller, { canvas: emitter.canvas });

  resetEditorStore({ viewportPreviewOpen: false });
  await renderCanvasWrapper(controller);

  const surfaceEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
    clientX: 56,
    clientY: 72,
  });

  await act(async () => {
    getCanvasSurface()?.dispatchEvent(surfaceEvent);
  });

  expect(surfaceEvent.defaultPrevented).toBe(false);
  expect(document.querySelector('[data-ui="editor.canvas.context-menu"]')).toBeNull();

  const fabricEvent = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
    clientX: 56,
    clientY: 72,
  });

  await act(async () => emitter.fireContextMenu(fabricEvent));

  expect(fabricEvent.defaultPrevented).toBe(true);
  expect(document.querySelector('[data-ui="editor.canvas.context-menu"]')).not.toBeNull();
});

it('blocks loaded-image viewport margins while keeping the menu closed', async () => {
  const controller = createControllerMock();
  Object.assign(controller, {
    canvas: {
      findTarget: vi.fn(() => null),
      getActiveObject: vi.fn(() => null),
      getActiveObjects: vi.fn(() => []),
    },
  });

  resetEditorStore({ viewportPreviewOpen: false });
  await renderCanvasWrapper(controller);

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
});

it('opens the no-image menu from the DOM-owned empty canvas state', async () => {
  const controller = createControllerMock();
  resetEditorStore({ imageData: null, viewportPreviewOpen: false });
  await renderCanvasWrapper(controller, false);

  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    button: 2,
    cancelable: true,
    clientX: 32,
    clientY: 48,
  });

  await act(async () => {
    getCanvasViewportZone()?.dispatchEvent(event);
  });

  expect(event.defaultPrevented).toBe(true);
  expect(getContextMenuText()).toContain(`${translate('editor.toolbar.openImage')}…`);
});
