// @vitest-environment jsdom

import { act, useContext, useEffect } from 'react';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';
import type { ContentDrawingController } from '../../../drawing/controller';
import type { ToolbarDrawingControlsOwner } from '../../../overlay/toolbar/controls/drawing';
import { createSelectionDrawingRuntime } from './drawing';
import { translate } from '../../../../platform/i18n';
import { useDrawingTextEditor } from '../../../drawing/text-editor';

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
  const button = harness.tooltip.root.querySelector<HTMLButtonElement>(
    '[data-ui="content.crop.mode-toggle"]'
  )!;
  expect(button.tagName).toBe('BUTTON');
  expect(button.querySelectorAll('button')).toHaveLength(0);
  expect(button.type).toBe('button');
  expect(button.title).toBe(translate('content.toolbar.cropDrawingMode'));
  expect(button.getAttribute('aria-label')).toBe(button.title);
  const resize = button.querySelector<HTMLElement>('[data-ui="content.crop.mode.resize"]')!;
  const drawing = button.querySelector<HTMLElement>('[data-ui="content.crop.mode.drawing"]')!;
  expect(drawing.querySelector('.lucide-pencil')).not.toBeNull();
  expect(drawing.querySelector('.lucide-pen-line')).toBeNull();
  expect(resize.dataset['active']).toBe('true');
  expect(drawing.dataset['active']).toBe('false');
  button.focus();
  expect(document.activeElement).toBe(button);
  act(() => resize.click());
  expect(harness.runtime.isDrawing()).toBe(true);
  expect(resize.dataset['active']).toBe('false');
  expect(drawing.dataset['active']).toBe('true');
  expect(button.title).toBe(translate('content.toolbar.cropResizeMode'));
  act(() => drawing.click());
  expect(harness.runtime.isDrawing()).toBe(false);
  act(() => drawing.click());
  expect(harness.runtime.isDrawing()).toBe(true);
  act(() => button.click());
  expect(harness.runtime.isDrawing()).toBe(false);
}

const state = vi.hoisted(() => ({
  controller: null as ContentDrawingController | null,
  prepare: vi.fn(() => true),
  resolvePageScrollRoot: vi.fn(),
  stopPreferences: vi.fn(),
  disconnect: vi.fn(),
  observer: null as (() => void) | null,
  resolveMenuLayout: undefined as ToolbarDrawingControlsOwner['resolveMenuLayout'],
  onExitDrawing: undefined as (() => void) | undefined,
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
    DrawingSurface: (props: { active: boolean; onExit?: () => void }) => {
      state.onExitDrawing = props.onExit;
      return <div data-surface-active={props.active} />;
    },
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
      <div
        data-tools-placement={props.owner.preferredMenuPlacement}
        data-command-scope={String(useContext(CommandPressScope))}
      >
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
    anchorOffset: 140,
    height: 40,
    width: 100,
  },
  {
    placement: 'up',
    toolbar: [0, 300, 200, 50],
    crop: [0, 360, 200, 200],
    anchorOffset: 0,
    height: 40,
    width: 100,
  },
  {
    placement: 'up',
    toolbar: [800, 300, 192, 50],
    crop: [800, 360, 192, 200],
    anchorOffset: 160,
    height: 40,
    width: 100,
  },
  {
    placement: 'down',
    toolbar: [300, 300, 200, 50],
    crop: [300, 200, 200, 90],
    height: 40,
    width: 100,
  },
  {
    placement: 'up',
    toolbar: [300, 520, 200, 50],
    crop: [300, 420, 200, 90],
    height: 40,
    width: 100,
  },
  {
    placement: 'up',
    toolbar: [300, 300, 200, 50],
    crop: [300, 360, 200, 200],
    height: 40,
    width: 100,
  },
  {
    placement: 'down',
    toolbar: [300, 18, 200, 50],
    crop: [300, 8, 200, 100],
    height: 40,
    width: 100,
  },
  {
    placement: 'up',
    toolbar: [300, 300, 200, 50],
    crop: [300, 360, 200, 200],
    height: 58,
    width: 100,
    pairPadding: 8,
  },
  {
    placement: 'down',
    toolbar: [300, 18, 200, 50],
    crop: [300, 8, 200, 100],
    height: 58,
    width: 100,
    pairPadding: 8,
  },
  {
    placement: 'down',
    toolbar: [420, 200, 200, 50],
    crop: [8, 8, 400, 584],
    height: 580,
    width: 200,
  },
  {
    placement: 'down',
    toolbar: [380, 200, 200, 50],
    crop: [592, 8, 400, 584],
    height: 580,
    width: 200,
  },
];

function checkMenuPlacement(
  harness: {
    container: HTMLElement;
    tooltip: ContentSizeTooltipDom;
    frame: HTMLElement;
    toggle(): void;
  },
  {
    placement,
    toolbar,
    crop,
    height,
    width,
    pairPadding,
    anchorOffset = 20,
  }: (typeof menuPlacementCases)[number]
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
  if (pairPadding) {
    const pair = document.createElement('div');
    pair.dataset['ui'] = 'content.toolbar.drawing-options.pair';
    pair.style.padding = `${pairPadding}px`;
    harness.tooltip.root.append(pair);
  }
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(toolbarX + anchorOffset, toolbarY + 9, 32, 32)
  );
  vi.spyOn(harness.tooltip.root, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(toolbarX, toolbarY, toolbarWidth, toolbarHeight)
  );
  vi.spyOn(harness.frame, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(cropX, cropY, cropWidth, cropHeight)
  );
  const padding = pairPadding ?? 0;
  const layout = state.resolveMenuLayout!({
    anchor,
    menuWidth: width,
    menuHeight: height,
    surfaceInset: padding,
  });
  expect(layout?.placement).toBe(placement);
  expect(layout?.style.overflowY).toBe('auto');
  const renderedHeight = Math.min(height, Number(layout?.style.maxHeight));
  const position = {
    x:
      typeof layout?.style.left === 'number'
        ? toolbarX + anchorOffset + layout.style.left
        : toolbarX + anchorOffset + 32 - Number(layout?.style.right) - width,
    y:
      typeof layout?.style.top === 'number'
        ? toolbarY + 9 + layout.style.top
        : toolbarY + 41 - Number(layout?.style.bottom) - renderedHeight,
  };
  if (height === 40) {
    const [x = 0, y = 0, rectWidth = 0, rectHeight = 0] = toolbar;
    expect(
      position.x + width <= x ||
        position.x >= x + rectWidth ||
        position.y + height <= y ||
        position.y >= y + rectHeight
    ).toBe(true);
  }
  expect(position.x + padding).toBe(
    Math.min(Math.max(8, toolbarX + anchorOffset), 992 - width + padding * 2)
  );
  expect(
    placement === 'up'
      ? toolbarY - position.y - renderedHeight + padding
      : position.y + padding - toolbarY - toolbarHeight
  ).toBe(1);
  expect(position.x + padding).toBeGreaterThanOrEqual(8);
  expect(position.x + width - padding).toBeLessThanOrEqual(992);
  expect(position.y + padding).toBeGreaterThanOrEqual(8);
  expect(position.y + renderedHeight - padding).toBeLessThanOrEqual(592);
}

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
function setup(initialDrawing = false) {
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
  const onModeChange = vi.fn();
  let runtime!: ReturnType<typeof createSelectionDrawingRuntime>;
  act(() => {
    runtime = createSelectionDrawingRuntime({
      container,
      onLayout,
      initialDrawing,
      onModeChange,
    });
  });
  runtimes.push(runtime);
  const tooltip = createTooltip(container);
  act(() => runtime.attachToolbar(tooltip));
  const toggle = () => {
    const button = tooltip.root.querySelector('[data-ui="content.crop.mode-toggle"]');
    expect(button).not.toBeNull();
    act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  return {
    container,
    runtime,
    tooltip,
    toggle,
    frame,
    handle,
    eventCatcher,
    onLayout,
    onModeChange,
  };
}

describe('crop remembered drawing mode', () => {
  it('adopts the normal drawing command scope and removes shell adoption on disposal', () => {
    const { runtime, tooltip, toggle } = setup();
    toggle();
    expect(tooltip.root.classList.contains('sniptale-content-toolbar-adopted')).toBe(true);
    expect(tooltip.root.querySelector('[data-command-scope="true"]')).not.toBeNull();
    for (const action of ['undo', 'redo']) {
      const button = tooltip.root.querySelector(`[data-ui="content.crop.${action}"]`)!;
      expect(button.hasAttribute('data-command-press')).toBe(true);
      expect(button.getAttribute('data-command-chrome')).toBe('true');
    }
    act(() => runtime.dispose());
    expect(tooltip.root.classList.contains('sniptale-content-toolbar-adopted')).toBe(false);
  });
  it('applies remembered Drawing only when the final toolbar attaches without saving hydration', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const onModeChange = vi.fn();
    let runtime!: ReturnType<typeof createSelectionDrawingRuntime>;
    act(() => {
      runtime = createSelectionDrawingRuntime({
        container,
        initialDrawing: true,
        onModeChange,
        onLayout: vi.fn(),
      });
    });
    runtimes.push(runtime);
    expect(runtime.isDrawing()).toBe(false);
    act(() => runtime.attachToolbar(createTooltip(container)));
    expect(runtime.isDrawing()).toBe(true);
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it('persists each explicit toggle from either icon area', () => {
    const { tooltip, onModeChange } = setup();
    const resize = tooltip.root.querySelector<HTMLElement>('[data-ui="content.crop.mode.resize"]')!;
    const drawing = tooltip.root.querySelector<HTMLElement>(
      '[data-ui="content.crop.mode.drawing"]'
    )!;
    act(() => resize.click());
    act(() => drawing.click());
    act(() => drawing.click());
    expect(onModeChange.mock.calls).toEqual([[true], [false], [true]]);
  });

  it('toggles from either icon area through one labeled native button', () => {
    checkNativeModeSwitch(setup());
  });
});

describe('crop drawing toolbar layout and coordinates', () => {
  it.each(menuPlacementCases)(
    'anchors the complete menu $placement to the toolbar within the viewport: $toolbar',
    (scenario) => checkMenuPlacement(setup(), scenario)
  );

  it('uses default layout only when the crop toolbar is absent', () => {
    const { tooltip, frame, toggle, container } = setup();
    toggle();
    const anchor = document.createElement('button');
    const resolve = () => state.resolveMenuLayout!({ anchor, menuWidth: 100, menuHeight: 40 });
    expect(resolve()).toBeNull();
    tooltip.root.classList.add('sniptale-selection-toolbar');
    tooltip.root.append(anchor);
    expect(resolve()).not.toBeNull();
    container.classList.add('sniptale-selection-container');
    frame.remove();
    expect(resolve()).not.toBeNull();
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

  it('supports explicit mode layout updates when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { runtime, toggle, onLayout } = setup();
    onLayout.mockClear();
    toggle();
    expect(runtime.isDrawing()).toBe(true);
    expect(onLayout).toHaveBeenCalledTimes(1);
  });
});

describe('crop history navigation and pending edits', () => {
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

  it('reattaches without changing the chosen mode or history and performs no save', () => {
    const { runtime, container, toggle, tooltip, onModeChange } = setup();
    toggle();
    act(() =>
      state.controller!.session.commitObject({
        id: 'retained',
        kind: 'blur',
        bounds: { x: 1, y: 2, width: 3, height: 4 },
      })
    );
    const nextTooltip = createTooltip(container);
    onModeChange.mockClear();
    act(() => runtime.attachToolbar(nextTooltip));
    expect(runtime.isDrawing()).toBe(true);
    expect(onModeChange).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[data-ui="content.crop.mode-toggle"]')).toHaveLength(1);
    expect(tooltip.root.querySelector('[data-ui="content.crop.resize-slot"]')).toBeNull();
    expect(tooltip.root.querySelector('[data-sizing]')?.parentElement).toBe(tooltip.root);
    expect(finalize(runtime).objects[0]?.id).toBe('retained');
    const undo = nextTooltip.root.querySelector<HTMLButtonElement>(
      '[data-ui="content.crop.undo"]'
    )!;
    expect(undo.disabled).toBe(false);
    act(() => undo.click());
    expect(finalize(runtime).objects).toHaveLength(0);
  });

  it('replaces Eraser and Clear with isolated Undo/Redo and preserves history across Resize', () => {
    const { runtime, tooltip, toggle } = setup(true);
    const undo = tooltip.root.querySelector<HTMLButtonElement>('[data-ui="content.crop.undo"]')!;
    const redo = tooltip.root.querySelector<HTMLButtonElement>('[data-ui="content.crop.redo"]')!;
    expect(tooltip.root.querySelector('[data-ui="content.crop.eraser"]')).toBeNull();
    expect(tooltip.root.querySelector('[data-ui="content.crop.clear"]')).toBeNull();
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);
    act(() =>
      state.controller!.session.commitObject({
        id: 'retained',
        kind: 'blur',
        bounds: { x: 30, y: 30, width: 30, height: 30 },
      })
    );
    expect(undo.disabled).toBe(false);
    act(() => undo.click());
    expect(finalize(runtime).objects).toHaveLength(0);
    expect(redo.disabled).toBe(false);
    toggle();
    toggle();
    act(() =>
      tooltip.root.querySelector<HTMLButtonElement>('[data-ui="content.crop.redo"]')!.click()
    );
    expect(finalize(runtime).objects).toHaveLength(1);
  });

  it('finalizes real pending text before Undo and restores it through Redo', () => {
    const { runtime, tooltip } = setup(true);
    const controller = state.controller!;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    let editor!: ReturnType<typeof useDrawingTextEditor>;
    function TextHarness() {
      editor = useDrawingTextEditor(controller);
      useEffect(() => {
        controller.registerInteractionFinalizer(() => editor.finalize());
        return () => controller.registerInteractionFinalizer(null);
      }, []);
      return null;
    }
    act(() => root.render(<TextHarness />));
    const undo = tooltip.root.querySelector<HTMLButtonElement>('[data-ui="content.crop.undo"]')!;
    const redo = tooltip.root.querySelector<HTMLButtonElement>('[data-ui="content.crop.redo"]')!;
    act(() =>
      editor.setDraft({ id: null, point: { x: 0, y: 0 }, value: 'Draft', width: 100, height: 20 })
    );
    expect(controller.session.getSnapshot().document.objects).toHaveLength(0);
    expect(undo.disabled).toBe(false);
    expect(redo.disabled).toBe(true);
    act(() => undo.click());
    expect(controller.session.getSnapshot().document.objects).toHaveLength(0);
    expect(editor.draft).toBeNull();
    expect(redo.disabled).toBe(false);
    act(() => redo.click());
    const text = controller.session.getSnapshot().document.objects[0];
    expect(text).toMatchObject({ kind: 'text', text: 'Draft' });
    if (text?.kind !== 'text') throw new Error('Expected the restored text object');
    act(() => editor.edit(text));
    act(() => editor.setDraft({ ...editor.draft!, value: 'Changed' }));
    expect(redo.disabled).toBe(true);
    act(() => undo.click());
    expect(controller.session.getSnapshot().document.objects[0]).toMatchObject({ text: 'Draft' });
    act(() => redo.click());
    expect(finalize(runtime).objects[0]).toMatchObject({ text: 'Changed' });
    const current = controller.session.getSnapshot().document.objects[0];
    if (current?.kind !== 'text') throw new Error('Expected the current text object');
    act(() => editor.edit(current));
    expect(controller.hasPendingTextChange?.()).toBe(false);
    act(() => undo.click());
    expect(controller.session.getSnapshot().document.objects[0]).toMatchObject({ text: 'Draft' });
    act(() => root.unmount());
  });
});

describe('crop drawing runtime disposal', () => {
  it('does not save Escape, Resize hydration, attachment, capture finalization or disposal', () => {
    const { runtime, container, tooltip, onModeChange } = setup(true);
    act(() => state.onExitDrawing!());
    expect(runtime.isDrawing()).toBe(false);
    act(() => runtime.attachToolbar(createTooltip(container)));
    expect(runtime.isDrawing()).toBe(false);
    finalize(runtime);
    act(() => runtime.dispose());
    act(() =>
      tooltip.root.querySelector<HTMLElement>('[data-ui="content.crop.mode.drawing"]')?.click()
    );
    expect(onModeChange).not.toHaveBeenCalled();
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
