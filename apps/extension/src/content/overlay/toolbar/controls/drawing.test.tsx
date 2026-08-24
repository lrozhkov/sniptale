// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession, DEFAULT_DRAWING_COLORS } from '../../../../features/drawing/public';
import type { ContentDrawingController } from '../../../drawing/controller';
import { ToolbarDrawingControls } from './drawing';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps pencil quick options beside its icon without extending the toolbar flow', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );
  expect(
    host.querySelectorAll(
      'button[data-ui^="content.toolbar.drawing."]:not([data-ui^="content.toolbar.drawing-options."])'
    )
  ).toHaveLength(7);
  expect(
    host.querySelector('[data-ui="content.toolbar.drawing.pencil"] .lucide-pen-line')
  ).not.toBeNull();
  expect([...host.children].map((element) => element.getAttribute('data-ui'))).toEqual([
    'content.toolbar.drawing-tools-group',
    'content.toolbar.drawing-actions-divider',
    'content.toolbar.drawing-actions-group',
  ]);
  const panel = host.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.pencil"]'
  );
  const colorGroup = panel?.querySelector<HTMLElement>(
    '[aria-label="content.toolbar.drawingColor"]'
  );
  expect(panel?.closest('.sniptale-popover-menu')).not.toBeNull();
  expect(panel?.closest('.relative')).not.toBeNull();
  expect(panel?.getAttribute('role')).toBe('group');
  expect(colorGroup?.getAttribute('role')).toBe('group');
  expect(colorGroup?.querySelector('button[title="#ef4444"]')?.getAttribute('aria-pressed')).toBe(
    'true'
  );
  expect(colorGroup?.querySelector('[data-ui="shared.ui.color-selector"]')).not.toBeNull();
  expect(host.querySelector('select[aria-label="content.toolbar.drawingWidth"]')).toBeNull();
  const width16 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.pencil.width-16"]'
  );
  const pencilPreviewSizes = [2, 4, 8, 16].map(
    (value) =>
      host.querySelector<HTMLElement>(
        `[data-ui="content.toolbar.drawing-options.pencil.width-${value}"] [data-ui="drawing-width-preview"]`
      )?.style.width
  );
  expect(pencilPreviewSizes).toEqual(['3px', '6px', '9px', '12px']);
  expect(width16?.title).toBe('content.toolbar.drawingWidth: 16px');
  const pencilWidthPreview = width16?.querySelector<HTMLElement>(
    '[data-ui="drawing-width-preview"]'
  );
  expect(pencilWidthPreview).not.toBeNull();
  expect(pencilWidthPreview?.style.width).toBe(pencilWidthPreview?.style.height);
  act(() => width16?.click());
  expect(session.getSnapshot().defaults.pencil.width).toBe(16);
  expect(width16?.getAttribute('aria-pressed')).toBe('true');
  expect(width16?.dataset['active']).toBe('true');
  expect(width16?.className).toContain('sniptale-glass-toolbar-button--active');
  expect(width16?.className).toContain('!text-[var(--sniptale-color-accent-emphasis)]');
  expect(width16?.className).toContain('!min-w-7');
  expect(width16?.className).toContain('aspect-square');
  act(() => panel?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).not.toBeNull();
  const arrow = host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.arrow"]');
  act(() => arrow?.click());
  expect(controller.finalizeInteraction).toHaveBeenCalledOnce();
  expect(session.getSnapshot().activeTool).toBe('arrow');
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingUndo"]')).toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingRedo"]')).toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingDelete"]')).toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingClear"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingClear"]')?.className).toContain(
    'sniptale-btn-danger'
  );
  expect(
    host.querySelector('[aria-label="content.toolbar.drawingClear"] .lucide-brush-cleaning')
  ).not.toBeNull();
  act(() => root.unmount());
});

it('toggles options on repeated active-tool clicks but keeps Selection options visible', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  const pencil = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing.pencil"]'
  );
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).not.toBeNull();
  act(() => pencil?.click());
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).toBeNull();
  act(() => pencil?.click());
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).not.toBeNull();

  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.arrow"]')?.click()
  );
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).not.toBeNull();
  session.commitObject({
    color: '#ef4444',
    dynamicWidth: true,
    end: { x: 80, y: 40 },
    id: 'selected-arrow',
    kind: 'arrow',
    start: { x: 20, y: 40 },
    width: 18,
  });
  act(() => session.setActiveTool('select'));
  const select = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing.select"]'
  );
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).not.toBeNull();
  act(() => select?.click());
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).not.toBeNull();
  act(() => root.unmount());
});

it('commits an arbitrary pencil color through the shared application picker', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  const pickerTrigger = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.pencil"] [data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  expect(pickerTrigger).not.toBeNull();
  await act(async () => pickerTrigger?.click());
  const hexInput = document.body.querySelector<HTMLInputElement>(
    'input[aria-label="shared.ui.colorSelectorHex"]'
  );
  expect(hexInput).not.toBeNull();
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    valueSetter?.call(hexInput, '#123abc');
    hexInput?.dispatchEvent(new Event('input', { bubbles: true }));
    hexInput?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await act(async () =>
    Array.from(document.body.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'shared.ui.colorSelectorApply')
      ?.click()
  );
  expect(session.getSnapshot().defaults.pencil.color).toBe('#123abc');
  act(() => root.unmount());
});

it('shows persistent arrow color, size, and shaft profile controls', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.arrow"]')?.click()
  );
  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]');
  expect(panel).not.toBeNull();
  const width24 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.arrow.width-24"]'
  );
  const arrowPreviewSizes = [8, 12, 18, 24].map(
    (value) =>
      panel?.querySelector<HTMLElement>(
        `[data-ui="content.toolbar.drawing-options.arrow.width-${value}"] [data-ui="drawing-width-preview"]`
      )?.style.height
  );
  expect(arrowPreviewSizes).toEqual(['2px', '5px', '7px', '10px']);
  const uniform = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.arrow.uniform"]'
  );
  const freehand = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.arrow.freehand"]'
  );
  expect(freehand).not.toBeNull();
  const blue = panel?.querySelector<HTMLButtonElement>('button[title="#60a5fa"]');
  act(() => width24?.click());
  act(() => uniform?.click());
  act(() => blue?.click());
  expect(session.getSnapshot().defaults.arrow).toEqual({
    color: '#60a5fa',
    design: 'standard',
    dynamicWidth: false,
    width: 24,
  });
  act(() => freehand?.click());
  expect(session.getSnapshot().defaults.arrow.design).toBe('freehand');
  expect(freehand?.getAttribute('aria-pressed')).toBe('true');
  expect(panel).not.toBeNull();
  act(() => root.unmount());
});

it('shows compact two-row text and background palettes with text-size controls', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => [...DEFAULT_DRAWING_COLORS, '#14b8a6', '#ec4899'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.text"]')?.click()
  );
  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.text"]');
  expect(
    panel?.querySelectorAll('[data-ui^="content.toolbar.drawing-options.text.font-"]')
  ).toHaveLength(4);
  const textPalette = panel?.querySelector<HTMLElement>(
    '[aria-label="content.toolbar.drawingTextColor"]'
  );
  const backgroundPalette = panel?.querySelector<HTMLElement>(
    '[aria-label="content.toolbar.drawingTextBackground"]'
  );
  expect(textPalette?.querySelector('.grid.grid-cols-4')).not.toBeNull();
  expect(backgroundPalette?.querySelector('.grid.grid-cols-4')).not.toBeNull();
  expect(textPalette?.querySelectorAll('button[title^="#"]')).toHaveLength(8);
  expect(textPalette?.querySelector('button[title="#14b8a6"]')).toBeNull();
  expect(textPalette?.querySelector('button[title="#ec4899"]')).toBeNull();
  expect(panel?.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(2);
  expect(textPalette?.getAttribute('role')).toBe('group');
  expect(backgroundPalette?.getAttribute('role')).toBe('group');

  act(() =>
    panel
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.drawing-options.text.font-serif"]'
      )
      ?.click()
  );
  act(() => textPalette?.querySelector<HTMLButtonElement>('button[title="#ffffff"]')?.click());
  act(() =>
    backgroundPalette?.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click()
  );
  act(() =>
    panel
      ?.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing-options.text.size-36"]')
      ?.click()
  );
  expect(session.getSnapshot().defaults.text).toEqual({
    backgroundColor: '#60a5fa',
    color: '#ffffff',
    fontFamily: 'serif',
    fontSize: 36,
  });
  const selectedTextColor =
    textPalette?.querySelector<HTMLButtonElement>('button[title="#ffffff"]');
  expect(selectedTextColor?.getAttribute('aria-label')).toBe(
    'content.toolbar.drawingTextColor: #ffffff'
  );
  expect(selectedTextColor?.getAttribute('aria-pressed')).toBe('true');
  act(() =>
    panel
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.drawing-options.text.background-none"]'
      )
      ?.click()
  );
  expect(session.getSnapshot().defaults.text.backgroundColor).toBeNull();
  act(() => root.unmount());
});

it('places Text immediately after Marker in the drawing toolbar', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  const order = Array.from(
    host.querySelectorAll<HTMLButtonElement>(
      '[data-ui^="content.toolbar.drawing."]:not([data-ui^="content.toolbar.drawing-options."])'
    )
  ).map((button) => button.dataset['ui']);
  expect(order.slice(0, 4)).toEqual([
    'content.toolbar.drawing.select',
    'content.toolbar.drawing.pencil',
    'content.toolbar.drawing.marker',
    'content.toolbar.drawing.text',
  ]);
  act(() => root.unmount());
});

it('uses one Shapes panel for outline, width, and alpha-aware fill controls', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  expect(host.querySelector('[data-ui="content.toolbar.drawing.rectangle"]')).toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing.ellipse"]')).toBeNull();
  const shape = host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.shape"]');
  act(() => shape?.click());
  const panel = host.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.shape"]'
  );
  expect(panel?.classList).toContain('flex');
  expect(
    panel?.querySelectorAll('[data-ui^="content.toolbar.drawing-options.shape.kind-"]')
  ).toHaveLength(3);
  expect(
    panel
      ?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill-none"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  expect(
    panel?.querySelectorAll(
      '[data-ui="content.toolbar.drawing-options.shape.fill-colors"] [aria-pressed="true"]'
    )
  ).toHaveLength(0);
  expect(panel?.querySelectorAll('[data-ui="shared.ui.color-selector"]')).toHaveLength(2);

  const triangle = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.kind-triangle"]'
  );
  const width8 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.width-8"]'
  );
  const shapePreviewSizes = [2, 4, 8].map(
    (value) =>
      panel?.querySelector<HTMLElement>(
        `[data-ui="content.toolbar.drawing-options.shape.width-${value}"] [data-ui="drawing-width-preview"]`
      )?.style.height
  );
  expect(shapePreviewSizes).toEqual(['2px', '6px', '10px']);
  const blue = host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]');
  act(() => triangle?.click());
  act(() => width8?.click());
  act(() => blue?.click());
  expect(session.getSnapshot().defaults.shape).toEqual({
    color: '#60a5fa',
    fillColor: null,
    kind: 'triangle',
    width: 8,
  });
  const fillPickerTrigger = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.fill"] ' +
      '[data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  await act(async () => fillPickerTrigger?.click());
  expect(
    document.body.querySelector('input[aria-label="shared.ui.colorSelectorAlpha"]')
  ).not.toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.shape"]')).not.toBeNull();
  act(() => root.unmount());
});

it('reuses the Shapes panel to change the kind of a selected outline object', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  session.commitObject({
    bounds: { x: 0, y: 0, width: 100, height: 60 },
    color: '#ef4444',
    id: 'selected-shape',
    kind: 'rectangle',
    width: 4,
  });
  session.setActiveTool('select');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.shape"]');
  expect(panel).not.toBeNull();
  expect(
    panel?.closest('.relative')?.querySelector('[data-ui="content.toolbar.drawing.select"]')
  ).not.toBeNull();
  expect(
    panel?.closest('.relative')?.querySelector('[data-ui="content.toolbar.drawing.shape"]')
  ).toBeNull();
  const deselect = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.deselect"]'
  );
  const deleteSelected = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.delete"]'
  );
  expect(deleteSelected).not.toBeNull();
  expect(deleteSelected?.className).toContain('sniptale-btn-danger');
  expect(deleteSelected?.nextElementSibling).toBe(deselect);
  act(() => deselect?.click());
  expect(session.getSnapshot().selectedObjectId).toBeNull();
  act(() => session.select('selected-shape'));
  expect(
    host.querySelector('[data-ui="content.toolbar.drawing-options.shape.kind-parallelogram"]')
  ).toBeNull();
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing-options.delete"]')
      ?.click()
  );
  expect(session.getSnapshot().document.objects).toHaveLength(0);
  expect(session.getSnapshot().selectedObjectId).toBeNull();
  act(() => root.unmount());
});

it('shows only deselect and delete actions for a selected blur object', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  session.commitObject({
    bounds: { x: 0, y: 0, width: 100, height: 60 },
    id: 'selected-blur',
    kind: 'blur',
  });
  session.setActiveTool('select');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.blur"]');
  expect(panel).not.toBeNull();
  expect(
    panel?.closest('.relative')?.querySelector('[data-ui="content.toolbar.drawing.select"]')
  ).not.toBeNull();
  expect(panel?.children).toHaveLength(2);
  const deselect = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.deselect"]'
  );
  const deleteSelected = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.delete"]'
  );
  expect(deleteSelected?.nextElementSibling).toBe(deselect);
  expect(session.getSnapshot().selectedObjectId).toBe('selected-blur');
  act(() => deselect?.click());
  expect(session.getSnapshot().selectedObjectId).toBeNull();
  act(() => session.select('selected-blur'));
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing-options.delete"]')
      ?.click()
  );
  expect(session.getSnapshot().document.objects).toHaveLength(0);
  act(() => root.unmount());
});

it('anchors quick options to the kind of a selected pencil object and edits that object', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  session.commitObject({
    color: '#111827',
    id: 'selected-pencil',
    kind: 'pencil',
    samples: [{ t: 0, x: 0, y: 0 }],
    width: 4,
  });
  session.setActiveTool('select');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  expect(
    host.querySelector('[data-ui="content.toolbar.drawing.select"]')?.getAttribute('aria-pressed')
  ).toBe('true');
  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]');
  expect(panel).not.toBeNull();
  expect(
    panel?.closest('.relative')?.querySelector('[data-ui="content.toolbar.drawing.select"]')
  ).not.toBeNull();
  const width8 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.pencil.width-8"]'
  );
  act(() => width8?.click());
  expect(session.getSnapshot().document.objects[0]).toMatchObject({ width: 8 });
  act(() => root.unmount());
});

it('uses the annotation droplet icon for the blur tool', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );

  expect(
    host.querySelector('[data-ui="content.toolbar.drawing.blur"] .lucide-droplet')
  ).not.toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing.blur"] .lucide-eraser')).toBeNull();
  act(() => root.unmount());
});

it('switches the persistent quick panel to marker colors, sizes, and opacity icons', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<ToolbarDrawingControls controller={controller} displayMode="vertical" />));

  const marker = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing.marker"]'
  );
  act(() => marker?.click());
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).toBeNull();
  const panel = host.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.marker"]'
  );
  const surface = panel?.closest<HTMLElement>('.sniptale-popover-menu');
  expect(surface?.style.left).toBe('calc(100% + 10px)');
  expect(surface?.style.top).toBe('8px');
  expect(surface?.style.maxHeight).toBe('calc(100vh - 16px)');
  expect(surface?.style.overflowY).toBe('auto');
  expect(surface?.style.zIndex).toBe('2147483646');
  expect(panel?.classList).toContain('flex-col');
  const markerColorGroup = panel?.querySelector('[aria-label="content.toolbar.drawingColor"]');
  expect(markerColorGroup?.classList).toContain('flex-col');
  expect(markerColorGroup?.querySelector('.grid')?.classList).toContain('grid-cols-2');
  const verticalDivider = panel?.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.divider"]'
  );
  expect(verticalDivider?.classList).toContain('h-px');
  expect(verticalDivider?.classList).toContain('w-full');

  const width44 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.marker.width-44"]'
  );
  const opacity30 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.marker.opacity-30"]'
  );
  const green = host.querySelector<HTMLButtonElement>('button[title="#22c55e"]');
  const markerWidthPreview = width44?.querySelector<HTMLElement>(
    '[data-ui="drawing-width-preview"]'
  );
  expect(markerWidthPreview).not.toBeNull();
  expect(markerWidthPreview?.style.width).toBe(markerWidthPreview?.style.height);
  expect(opacity30?.querySelector('.lucide-blend')).not.toBeNull();
  act(() => width44?.click());
  act(() => opacity30?.click());
  act(() => green?.click());
  expect(session.getSnapshot().defaults.marker).toMatchObject({
    color: '#22c55e',
    opacity: 0.3,
    width: 44,
  });
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.marker"]')).not.toBeNull();

  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.text"]')?.click()
  );
  const textPanel = host.querySelector<HTMLElement>(
    '[data-ui="content.toolbar.drawing-options.text"]'
  );
  expect(textPanel?.classList).toContain('flex-col');
  const textColorGroup = textPanel?.querySelector(
    '[aria-label="content.toolbar.drawingTextColor"]'
  );
  expect(textColorGroup?.classList).toContain('flex-col');
  expect(textColorGroup?.querySelector('.grid')?.classList).toContain('grid-cols-2');
  const textBackgroundGroup = textPanel?.querySelector(
    '[data-ui="content.toolbar.drawing-options.text.background-group"]'
  );
  expect(textBackgroundGroup?.classList).toContain('flex-col');
  expect(textBackgroundGroup?.querySelector('.grid')?.classList).toContain('grid-cols-2');
  act(() => root.unmount());
});

it('keeps Drawing options inside right and bottom viewport edges under page zoom', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 600);
  vi.stubGlobal('innerHeight', 400);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const isTrigger = this.matches('[data-ui="content.toolbar.drawing.pencil"]');
      const x = isTrigger ? 570 : 0;
      const y = isTrigger ? 360 : 0;
      const width = isTrigger ? 36 : 0;
      const height = isTrigger ? 36 : 0;
      return {
        bottom: y + height,
        height,
        left: x,
        right: x + width,
        top: y,
        width,
        x,
        y,
        toJSON: () => ({}),
      };
    }
  );
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => DEFAULT_DRAWING_COLORS,
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  host.style.setProperty('--sniptale-content-ui-scale', '0.5');
  document.body.append(host);
  const root = createRoot(host);

  act(() => root.render(<ToolbarDrawingControls controller={controller} displayMode="vertical" />));
  const verticalSurface = host
    .querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')
    ?.closest<HTMLElement>('.sniptale-popover-menu');
  expect(verticalSurface?.style.right).toBe('calc(100% + 10px)');
  expect(verticalSurface?.style.left).toBe('auto');
  expect(verticalSurface?.style.maxWidth).toBe('calc(100vw - 16px)');
  expect(verticalSurface?.style.overflowX).toBe('auto');

  act(() =>
    root.render(<ToolbarDrawingControls controller={controller} displayMode="horizontal" />)
  );
  const horizontalSurface = host
    .querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')
    ?.closest<HTMLElement>('.sniptale-popover-menu');
  expect(horizontalSurface?.style.bottom).toBe('calc(100% + 10px)');
  expect(horizontalSurface?.style.top).toBe('auto');
  act(() => root.unmount());
});
