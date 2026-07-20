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
const TOOLBAR_SELECTOR = '[data-ui="editor.floating.canvas-selection-toolbar"]';

function command(id: string): CompactCommand {
  return { id, title: id, trigger: id, content: <div data-ui={`content.${id}`} /> };
}

function renderToolbar(enabled = true) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <EditorCanvasSelectionToolbar
        enabled={enabled}
        documentController={
          {
            arrangeSelection: vi.fn(),
            canDeleteSelection: true,
            compactCommandGroups: [[command('shape-fill-color'), command('shape-stroke-width')]],
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

function getToolbar() {
  return container?.querySelector<HTMLElement>(TOOLBAR_SELECTOR) ?? null;
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
  controller.viewportElement = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('positions the canvas toolbar above the selected object and opens group popovers', () => {
  renderToolbar();

  const toolbar = getToolbar();
  expect(toolbar?.style.left).toBe('310px');
  expect(toolbar?.style.top).toBe('156px');

  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.canvas-toolbar.group.fill"]'
  );
  Object.defineProperty(toolbar, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 690, left: 250, top: 650 }),
  });
  Object.defineProperty(button, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 300, top: 658, width: 36 }),
  });

  act(() => {
    button?.click();
  });

  const popover = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.canvas-toolbar.popover.fill"]'
  );
  expect(popover).not.toBeNull();
  expect(popover?.className).toContain('bottom-[calc(100%+0.75rem)]');
  expect(popover?.style.getPropertyValue('--editor-floating-popover-max-height')).toBeTruthy();
});

it('keeps canvas toolbar popovers below when the selection is near the viewport top', () => {
  controller.canvas.getActiveObject.mockReturnValue({
    getCoords: () => [
      { x: 200, y: 90 },
      { x: 400, y: 90 },
      { x: 400, y: 170 },
      { x: 200, y: 170 },
    ],
  });
  renderToolbar();

  const toolbar = getToolbar();
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.canvas-toolbar.group.more"]'
  );
  Object.defineProperty(toolbar, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ bottom: 110, left: 40, top: 70 }),
  });
  Object.defineProperty(button, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 1120, width: 36 }),
  });

  act(() => {
    button?.click();
  });

  const popover = container?.querySelector<HTMLElement>(
    '[data-ui="editor.floating.canvas-toolbar.popover.more"]'
  );
  expect(popover?.className).toContain('top-[calc(100%+0.75rem)]');
  expect(Number.parseFloat(popover?.style.left ?? '0')).toBeLessThan(900);
});

it('hides during transform and returns 500ms after primary mouse release', () => {
  vi.useFakeTimers();
  renderToolbar();

  act(() => {
    listeners.get('object:moving')?.forEach((handler) => handler());
  });
  expect(getToolbar()).toBeNull();

  act(() => {
    listeners.get('object:modified')?.forEach((handler) => handler());
    vi.advanceTimersByTime(500);
  });
  expect(getToolbar()).toBeNull();

  act(() => {
    listeners.get('mouse:up')?.forEach((handler) => handler());
    vi.advanceTimersByTime(499);
  });
  expect(getToolbar()).toBeNull();

  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(getToolbar()).not.toBeNull();
  vi.useRealTimers();
});

it('closes open popovers while hidden during transform and returns after the delayed timer', () => {
  vi.useFakeTimers();
  renderToolbar();
  const button = container?.querySelector<HTMLButtonElement>(
    '[data-ui="editor.floating.canvas-toolbar.group.fill"]'
  );

  act(() => {
    button?.click();
  });
  expect(
    container?.querySelector('[data-ui="editor.floating.canvas-toolbar.popover.fill"]')
  ).not.toBeNull();

  act(() => {
    listeners.get('object:moving')?.forEach((handler) => handler());
  });
  expect(getToolbar()).toBeNull();

  act(() => {
    listeners.get('object:modified')?.forEach((handler) => handler());
    listeners.get('mouse:up')?.forEach((handler) => handler());
    vi.advanceTimersByTime(500);
  });
  expect(getToolbar()).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="editor.floating.canvas-toolbar.popover.fill"]')
  ).toBeNull();
  vi.useRealTimers();
});

it('hides during viewport movement and restores after the delayed settle timer', () => {
  vi.useFakeTimers();
  const viewportElement = document.createElement('div');
  controller.viewportElement = viewportElement;
  renderToolbar();

  act(() => {
    viewportElement.dispatchEvent(new Event('scroll'));
  });
  expect(getToolbar()).toBeNull();

  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(getToolbar()).not.toBeNull();
  vi.useRealTimers();
});

it('uses below placement only when there is not enough room above the selection', () => {
  controller.canvas.getActiveObject.mockReturnValue({
    getCoords: () => [
      { x: 200, y: 80 },
      { x: 400, y: 80 },
      { x: 400, y: 160 },
      { x: 200, y: 160 },
    ],
  });
  renderToolbar();
  expect(getToolbar()?.style.top).toBe('244px');

  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
  controller.canvas.getActiveObject.mockReturnValue({
    getCoords: () => [
      { x: 40, y: 110 },
      { x: 140, y: 110 },
      { x: 140, y: 190 },
      { x: 40, y: 190 },
    ],
  });
  renderToolbar();
  expect(
    (container as HTMLDivElement | null)?.querySelector<HTMLElement>(
      '[data-ui="editor.floating.canvas-selection-toolbar"]'
    )
  ).toBeNull();
});

it('omits the canvas toolbar when geometry cannot be resolved', () => {
  controller.canvas.getActiveObject.mockReturnValue(null);
  renderToolbar();

  expect(getToolbar()).toBeNull();
});
