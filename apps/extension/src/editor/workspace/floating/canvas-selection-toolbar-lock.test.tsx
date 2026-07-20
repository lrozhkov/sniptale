// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CompactCommand } from '../../inspector/compact';
import { EditorCanvasSelectionToolbar } from './canvas-selection-toolbar';

const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
const controller = vi.hoisted(() => ({
  canvas: {
    getActiveObject: vi.fn(),
    getElement: vi.fn(),
    getZoom: vi.fn(() => 1),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) =>
      listeners.get(event)?.delete(handler)
    ),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const bucket = listeners.get(event) ?? new Set();
      bucket.add(handler);
      listeners.set(event, bucket);
    }),
  },
  deleteSelection: vi.fn(),
  duplicateSelection: vi.fn(),
  toggleLayerLock: vi.fn(),
  viewportElement: null as HTMLElement | null,
}));

vi.mock('../../application/controller-context', () => ({
  EditorControllerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useEditorController: () => controller,
  useOptionalEditorController: () => null,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function command(id: string): CompactCommand {
  return { id, title: id, trigger: id, content: <div data-ui={`content.${id}`} /> };
}

function renderToolbar() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <EditorCanvasSelectionToolbar
        enabled
        documentController={
          {
            arrangeSelection: vi.fn(),
            canDeleteSelection: true,
            compactCommandGroups: [[command('shape-fill-color')]],
            isResizableLayerSelection: false,
            onOpenLayerEffects: vi.fn(),
          } as never
        }
        selection={
          {
            hasSelection: true,
            selectedObjectCount: 1,
            selectedObjectId: 'layer-1',
            selectedObjectType: 'rectangle',
          } as never
        }
      />
    );
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  listeners.clear();
  vi.clearAllMocks();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  controller.canvas.getElement.mockReturnValue({
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
  });
  controller.canvas.getActiveObject.mockReturnValue({
    getCoords: () => [
      { x: 200, y: 260 },
      { x: 400, y: 260 },
      { x: 400, y: 360 },
      { x: 200, y: 360 },
    ],
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows the lock action separated before More and toggles the selected layer lock', () => {
  renderToolbar();

  const divider = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.canvas-toolbar.lock-divider"]'
  );
  const lockButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.canvas-toolbar.group.layer-lock"]'
  );
  const moreButton = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.canvas-toolbar.group.more"]'
  );

  expect(divider).not.toBeNull();
  expect(lockButton).not.toBeNull();
  expect(moreButton).not.toBeNull();

  act(() => {
    lockButton?.click();
  });

  expect(controller.toggleLayerLock).toHaveBeenCalledWith('layer-1');
  expect(
    container?.querySelector('[data-ui="editor.floating.canvas-toolbar.popover.layer-lock"]')
  ).toBeNull();
});
