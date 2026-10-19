// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import type { ContentDrawingController } from '../../../drawing/controller';
import type { ToolbarDrawingControlsOwner } from '../../../overlay/toolbar/controls/drawing';
import { createSelectionDrawingRuntime } from './drawing';
import { translate } from '../../../../platform/i18n';

function finalize(runtime: ReturnType<typeof createSelectionDrawingRuntime>) {
  let snapshot!: ReturnType<typeof runtime.finalize>;
  act(() => {
    snapshot = runtime.finalize();
  });
  return snapshot;
}

function checkNativeModeSwitch(harness: {
  tooltip: ContentSizeTooltipDom;
  runtime: ReturnType<typeof createSelectionDrawingRuntime>;
  onLayout: ReturnType<typeof vi.fn>;
}) {
  const group = harness.tooltip.root.querySelector('[data-ui="content.crop.mode-toggle"]')!;
  const buttons = group.querySelectorAll<HTMLButtonElement>('button');
  expect(group.getAttribute('role')).toBe('group');
  expect(buttons).toHaveLength(2);
  const resize = buttons[0]!;
  const drawing = buttons[1]!;
  for (const button of buttons) {
    expect(button.type).toBe('button');
    expect(button.tabIndex).toBe(0);
    expect(button.title).toBe(button.getAttribute('aria-label'));
    expect(button.classList.contains('sniptale-selection-mode-option')).toBe(true);
  }
  expect(resize.getAttribute('aria-label')).toBe(translate('content.toolbar.cropResizeMode'));
  expect(drawing.getAttribute('aria-label')).toBe(translate('content.toolbar.cropDrawingMode'));
  expect(resize.getAttribute('aria-pressed')).toBe('true');
  expect(drawing.getAttribute('aria-pressed')).toBe('false');
  harness.onLayout.mockClear();
  act(() => resize.click());
  expect(harness.onLayout).not.toHaveBeenCalled();
  drawing.focus();
  expect(document.activeElement).toBe(drawing);
  act(() => drawing.click());
  expect(harness.runtime.isDrawing()).toBe(true);
  expect(resize.getAttribute('aria-pressed')).toBe('false');
  expect(drawing.getAttribute('aria-pressed')).toBe('true');
  harness.onLayout.mockClear();
  act(() => drawing.click());
  expect(harness.onLayout).not.toHaveBeenCalled();
}

const state = vi.hoisted(() => ({
  controller: null as ContentDrawingController | null,
  prepare: vi.fn(() => true),
  resolvePageScrollRoot: vi.fn(),
  stopPreferences: vi.fn(),
  disconnect: vi.fn(),
  observer: null as (() => void) | null,
  resolveMenuLayout: undefined as ToolbarDrawingControlsOwner['resolveMenuLayout'],
}));

vi.mock('../../../drawing/controller', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../drawing/controller')>();
  return {
    ...original,
    createContentDrawingController: (
      ...args: Parameters<typeof original.createContentDrawingController>
    ) => {
      state.controller = original.createContentDrawingController(...args);
      const prepare = state.controller.prepareActivation;
      state.prepare.mockImplementation(prepare);
      state.controller.prepareActivation = state.prepare;
      return state.controller;
    },
    synchronizeContentDrawingPreferences: () => state.stopPreferences,
  };
});
vi.mock('../../../platform/page-scroll', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/page-scroll')>()),
  resolvePageScrollRoot: state.resolvePageScrollRoot,
}));
vi.mock('../../../drawing/surface', async () => {
  const interaction = await import('../../../drawing/interaction');
  return {
    DrawingSurface: (props: { active: boolean }) => <div data-surface-active={props.active} />,
    getDrawingViewportProjection: interaction.getDrawingViewportProjection,
    toDrawingScenePoint: interaction.toDrawingScenePoint,
  };
});
vi.mock('../../../overlay/toolbar/controls/drawing', () => ({
  ToolbarDrawingControls: (props: {
    owner: ToolbarDrawingControlsOwner;
    controller: ContentDrawingController;
  }) => {
    state.resolveMenuLayout = props.owner.resolveMenuLayout;
    return (
      <div data-tools-placement={props.owner.preferredMenuPlacement}>
        {props.owner.renderActions?.(props.controller.session.getSnapshot())}
      </div>
    );
  },
}));

function createTooltip(container: HTMLElement): ContentSizeTooltipDom {
  const root = document.createElement('div');
  const sizing = document.createElement('div');
  sizing.dataset['sizing'] = 'true';
  sizing.style.display = 'inline-flex';
  const actions = document.createElement('div');
  const cancelButton = document.createElement('button');
  const confirmButton = document.createElement('button');
  actions.append(confirmButton, cancelButton);
  root.append(sizing, actions);
  container.append(root);
  return {
    root,
    actions,
    cancelButton,
    confirmButton,
    widthInput: document.createElement('input'),
    heightInput: document.createElement('input'),
    aspectRatioButton: document.createElement('button'),
    widthDecreaseButton: document.createElement('button'),
    widthIncreaseButton: document.createElement('button'),
    heightDecreaseButton: document.createElement('button'),
    heightIncreaseButton: document.createElement('button'),
  };
}

const menuPlacementCases = [
  {
    placement: 'up',
    toolbar: [300, 300, 200, 50],
    crop: [300, 360, 200, 200],
    height: 40,
    width: 100,
    style: { left: -20, right: 'auto', top: 'auto', bottom: 51 },
  },
  {
    placement: 'down',
    toolbar: [300, 118, 200, 50],
    crop: [300, 8, 200, 100],
    height: 40,
    width: 100,
    style: { left: -20, right: 'auto', top: 51, bottom: 'auto' },
  },
  {
    placement: 'side',
    toolbar: [420, 200, 200, 50],
    crop: [8, 8, 400, 584],
    height: 580,
    width: 200,
    style: { left: 190, right: 'auto', top: -197, bottom: 'auto' },
  },
  {
    placement: 'side',
    toolbar: [380, 200, 200, 50],
    crop: [592, 8, 400, 584],
    height: 580,
    width: 200,
    style: { left: 'auto', right: 62, top: -197, bottom: 'auto' },
  },
];

function checkMenuPlacement(
  harness: {
    container: HTMLElement;
    tooltip: ContentSizeTooltipDom;
    frame: HTMLElement;
    toggle(): void;
  },
  { placement, toolbar, crop, height, width, style }: (typeof menuPlacementCases)[number]
) {
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 600);
  harness.container.classList.add('sniptale-selection-container');
  harness.tooltip.root.classList.add('sniptale-selection-toolbar');
  harness.toggle();
  const [toolbarX = 0, toolbarY = 0, toolbarWidth = 0, toolbarHeight = 0] = toolbar;
  const [cropX = 0, cropY = 0, cropWidth = 0, cropHeight = 0] = crop;
  const anchor = document.createElement('button');
  harness.tooltip.root.append(anchor);
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(toolbarX + 20, toolbarY + 9, 32, 32)
  );
  vi.spyOn(harness.tooltip.root, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(toolbarX, toolbarY, toolbarWidth, toolbarHeight)
  );
  vi.spyOn(harness.frame, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(cropX, cropY, cropWidth, cropHeight)
  );
  const layout = state.resolveMenuLayout!({ anchor, menuWidth: width, menuHeight: height });
  expect(layout).toEqual({
    placement,
    style: { ...style, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' },
  });
  const position = {
    x:
      typeof layout?.style.left === 'number'
        ? toolbarX + 20 + layout.style.left
        : toolbarX + 52 - Number(layout?.style.right) - width,
    y:
      typeof layout?.style.top === 'number'
        ? toolbarY + 9 + layout.style.top
        : toolbarY + 41 - Number(layout?.style.bottom) - height,
  };
  for (const [x = 0, y = 0, rectWidth = 0, rectHeight = 0] of [toolbar, crop]) {
    expect(
      position.x + width <= x ||
        position.x >= x + rectWidth ||
        position.y + height <= y ||
        position.y >= y + rectHeight
    ).toBe(true);
  }
  expect(position.x).toBeGreaterThanOrEqual(8);
  expect(position.x + width).toBeLessThanOrEqual(992);
  expect(position.y).toBeGreaterThanOrEqual(8);
  expect(position.y + height).toBeLessThanOrEqual(592);
}

describe('crop drawing runtime', () => {
  const runtimes: Array<ReturnType<typeof createSelectionDrawingRuntime>> = [];
  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('scrollX', 13);
    vi.stubGlobal('scrollY', 17);
    state.prepare.mockReturnValue(true);
    state.resolveMenuLayout = undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          state.observer = callback;
        }
        observe() {}
        disconnect = state.disconnect;
      }
    );
  });
  afterEach(() => {
    act(() => runtimes.forEach((runtime) => runtime.dispose()));
    runtimes.length = 0;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  function setup() {
    const container = document.createElement('div');
    document.body.append(container);
    const frame = document.createElement('div');
    frame.className = 'sniptale-selection-final-frame';
    const handle = document.createElement('div');
    handle.className = 'sniptale-resize-handle';
    frame.appendChild(handle);
    const eventCatcher = document.createElement('div');
    eventCatcher.className = 'sniptale-selection-event-catcher';
    container.append(frame, eventCatcher);
    const onLayout = vi.fn();
    let runtime!: ReturnType<typeof createSelectionDrawingRuntime>;
    act(() => {
      runtime = createSelectionDrawingRuntime({ container, onLayout });
    });
    runtimes.push(runtime);
    const tooltip = createTooltip(container);
    act(() => runtime.attachToolbar(tooltip));
    const toggle = () => {
      const button = tooltip.root.querySelector(
        '[data-ui="content.crop.mode-toggle"] button[aria-pressed="false"]'
      );
      expect(button).not.toBeNull();
      act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    };
    return { container, runtime, tooltip, toggle, frame, handle, eventCatcher, onLayout };
  }

  it('shows two native, labeled mode options with explicit state and idempotent activation', () => {
    checkNativeModeSwitch(setup());
  });

  it.each(menuPlacementCases)(
    'places the complete menu $placement without covering crop or toolbar: $toolbar',
    (scenario) => checkMenuPlacement(setup(), scenario)
  );

  it('uses default layout when the crop toolbar or frame is absent', () => {
    const { tooltip, frame, toggle, container } = setup();
    toggle();
    const anchor = document.createElement('button');
    const resolve = () => state.resolveMenuLayout!({ anchor, menuWidth: 100, menuHeight: 40 });
    expect(resolve()).toBeNull();
    tooltip.root.classList.add('sniptale-selection-toolbar');
    tooltip.root.append(anchor);
    expect(resolve()).toBeNull();
    container.classList.add('sniptale-selection-container');
    frame.remove();
    expect(resolve()).toBeNull();
  });

  it('switches sizing and drawing controls without replacing the surface or losing ink', () => {
    const { container, runtime, tooltip, toggle, frame, handle, eventCatcher } = setup();
    const surface = container.querySelector('[data-surface-active]');
    const sizing = tooltip.root.querySelector<HTMLElement>('[data-sizing]')!;
    toggle();
    expect(runtime.isDrawing()).toBe(true);
    expect(frame.style.pointerEvents).toBe('none');
    expect(handle.style.display).toBe('none');
    expect(eventCatcher.style.pointerEvents).toBe('none');
    expect(sizing.parentElement?.style.display).toBe('none');
    expect(tooltip.actions.style.display).not.toBe('none');
    expect(tooltip.root.querySelector('[data-tools-placement="up"]')).not.toBeNull();
    act(() =>
      state.controller!.session.commitObject({
        id: 'ink',
        kind: 'blur',
        bounds: { x: 20, y: 25, width: 30, height: 40 },
      })
    );
    toggle();
    expect(runtime.isDrawing()).toBe(false);
    expect(frame.style.pointerEvents).toBe('auto');
    expect(handle.style.display).toBe('');
    expect(eventCatcher.style.pointerEvents).toBe('auto');
    expect(sizing.style.display).toBe('inline-flex');
    expect(container.querySelector('[data-surface-active]')).toBe(surface);
    toggle();
    expect(finalize(runtime).objects.map((object) => object.id)).toEqual(['ink']);
  });

  it('keeps sizing controls hidden when canonical size synchronization reveals a child', () => {
    const { tooltip, toggle } = setup();
    const ratioButton = tooltip.aspectRatioButton;
    tooltip.root.querySelector('[data-sizing]')!.appendChild(ratioButton);
    toggle();
    ratioButton.style.display = 'inline-flex';
    state.observer!();
    const resizeControls = ratioButton.closest<HTMLElement>('[data-ui="content.crop.resize-slot"]');
    expect(resizeControls).not.toBeNull();
    expect(resizeControls?.style.display).toBe('none');
    expect(tooltip.actions.style.display).not.toBe('none');
    toggle();
    expect(resizeControls?.style.display).toBe('inline-flex');
    expect(ratioButton.style.display).toBe('inline-flex');
  });

  it('keeps viewport coordinates on pages whose drawing root is a clipped scrollable element', () => {
    const scrollArea = document.createElement('div');
    scrollArea.style.overflow = 'auto';
    scrollArea.style.width = '100px';
    scrollArea.style.height = '100px';
    document.body.append(scrollArea);
    state.resolvePageScrollRoot.mockReturnValue({ kind: 'element', element: scrollArea });
    const { runtime, tooltip, toggle } = setup();
    toggle();
    expect(runtime.isDrawing()).toBe(true);
    expect(state.resolvePageScrollRoot).not.toHaveBeenCalled();
    expect(state.prepare).not.toHaveBeenCalled();
    expect(state.controller!.getScrollRoot()).toEqual({ kind: 'viewport', element: null });
    act(() =>
      state.controller!.session.commitObject({
        id: 'outside-element',
        kind: 'blur',
        bounds: { x: 400, y: 300, width: 30, height: 40 },
      })
    );
    const snapshot = finalize(runtime);
    expect(snapshot.projection).toEqual({ x: 0, y: 0 });
    expect(snapshot.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight });
    expect(snapshot.objects[0]).toMatchObject({
      id: 'outside-element',
      bounds: { x: 400, y: 300, width: 30, height: 40 },
    });
    expect(tooltip.root.dataset['ui']).toBe('shared.ui.content-toolbar');
  });

  it('finalizes pending editing before capturing the document and viewport projection', () => {
    const { runtime } = setup();
    state.controller!.registerInteractionFinalizer(() => {
      state.controller!.session.commitObject({
        id: 'pending',
        kind: 'blur',
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      });
    });
    const snapshot = finalize(runtime);
    expect(snapshot.objects[0]?.id).toBe('pending');
    expect(snapshot.projection).toEqual({ x: 0, y: 0 });
    expect(snapshot.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight });
  });

  it('reattaches in resize mode and preserves the same document', () => {
    const { runtime, container, toggle, tooltip } = setup();
    toggle();
    act(() =>
      state.controller!.session.commitObject({
        id: 'retained',
        kind: 'blur',
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      })
    );
    const nextTooltip = createTooltip(container);
    act(() => runtime.attachToolbar(nextTooltip));
    expect(runtime.isDrawing()).toBe(false);
    expect(container.querySelectorAll('[data-ui="content.crop.mode-toggle"]')).toHaveLength(1);
    expect(tooltip.root.querySelector('[data-ui="content.crop.resize-slot"]')).toBeNull();
    expect(tooltip.root.querySelector('[data-sizing]')?.parentElement).toBe(tooltip.root);
    expect(finalize(runtime).objects[0]?.id).toBe('retained');
  });

  it('supports explicit mode layout updates when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { runtime, toggle, onLayout } = setup();
    onLayout.mockClear();
    toggle();
    expect(runtime.isDrawing()).toBe(true);
    expect(onLayout).toHaveBeenCalledTimes(1);
  });

  it('erases intersecting annotations without treating toolbar controls as canvas strokes', () => {
    const { runtime, container, tooltip, toggle } = setup();
    toggle();
    act(() =>
      state.controller!.session.commitObject({
        id: 'erase',
        kind: 'blur',
        bounds: { x: 30, y: 30, width: 30, height: 30 },
      })
    );
    const eraser = tooltip.root.querySelector<HTMLElement>('[data-ui="content.crop.eraser"]')!;
    act(() => eraser.click());
    const layer = container.querySelector<HTMLElement>('[data-ui="content.crop.drawing-layer"]')!;
    const pointer = (target: HTMLElement, type: string) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: 40, clientY: 40, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 7 });
      act(() => target.dispatchEvent(event));
    };
    pointer(eraser, 'pointerdown');
    pointer(layer, 'pointerup');
    expect(finalize(runtime).objects).toHaveLength(1);
    pointer(layer, 'pointerdown');
    pointer(layer, 'pointerup');
    expect(finalize(runtime).objects).toHaveLength(0);
    expect(layer.style.cursor).toBe('crosshair');
    expect(container.querySelector('[data-surface-active="false"]')).not.toBeNull();
  });

  it('repositions on viewport resize and removes the listener on disposal', () => {
    const { runtime, onLayout } = setup();
    onLayout.mockClear();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(onLayout).toHaveBeenCalledOnce();
    act(() => runtime.dispose());
    act(() => window.dispatchEvent(new Event('resize')));
    expect(onLayout).toHaveBeenCalledOnce();
  });

  it('notifies layout only when observed toolbar dimensions change and disposes once', () => {
    const { runtime, container, onLayout } = setup();
    onLayout.mockClear();
    state.observer!();
    state.observer!();
    expect(onLayout).toHaveBeenCalledTimes(1);
    act(() => {
      runtime.dispose();
      runtime.dispose();
    });
    expect(state.stopPreferences).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-ui="content.crop.drawing-layer"]')).toBeNull();
    expect(container.querySelector('[data-ui="content.crop.mode-toggle"]')).toBeNull();
  });
});
