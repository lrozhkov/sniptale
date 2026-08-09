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
  expect(host.querySelector('select[aria-label="content.toolbar.drawingWidth"]')).toBeNull();
  const width16 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.pencil.width-16"]'
  );
  expect(width16?.title).toBe('content.toolbar.drawingWidth: 16px');
  act(() => width16?.click());
  expect(session.getSnapshot().defaults.pencil.width).toBe(16);
  expect(width16?.getAttribute('aria-pressed')).toBe('true');
  expect(width16?.className).toContain('bg-[var(--sniptale-color-surface-hover)]');
  expect(width16?.className).not.toContain('border-[var(--sniptale-color-accent)]');
  expect(width16?.className).not.toContain('shadow-[inset_0_0_0_1px_var(--sniptale-color-accent)]');
  act(() => panel?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.pencil"]')).not.toBeNull();
  const arrow = host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.arrow"]');
  act(() => arrow?.click());
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.arrow"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingUndo"]')).toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingRedo"]')).toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingDelete"]')).not.toBeNull();
  expect(host.querySelector('[aria-label="content.toolbar.drawingClear"]')).not.toBeNull();
  expect(
    host.querySelector('[aria-label="content.toolbar.drawingClear"] .lucide-brush-cleaning')
  ).not.toBeNull();
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
  const uniform = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.arrow.uniform"]'
  );
  const blue = panel?.querySelector<HTMLButtonElement>('button[title="#60a5fa"]');
  act(() => width24?.click());
  act(() => uniform?.click());
  act(() => blue?.click());
  expect(session.getSnapshot().defaults.arrow).toEqual({
    color: '#60a5fa',
    dynamicWidth: false,
    width: 24,
  });
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
    host.querySelector<HTMLButtonElement>('[data-ui="content.toolbar.drawing.text"]')?.click()
  );
  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.text"]');
  const textPalette = panel?.querySelector<HTMLElement>(
    '[aria-label="content.toolbar.drawingTextColor"]'
  );
  const backgroundPalette = panel?.querySelector<HTMLElement>(
    '[aria-label="content.toolbar.drawingTextBackground"]'
  );
  expect(textPalette?.querySelector('.grid.grid-cols-5')).not.toBeNull();
  expect(backgroundPalette?.querySelector('.grid.grid-cols-5')).not.toBeNull();
  expect(textPalette?.getAttribute('role')).toBe('group');
  expect(backgroundPalette?.getAttribute('role')).toBe('group');

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

it('uses one Shapes icon for four outline shapes, color, and width in one row', () => {
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
  ).toHaveLength(4);

  const triangle = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.kind-triangle"]'
  );
  const width8 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.width-8"]'
  );
  const blue = host.querySelector<HTMLButtonElement>('button[title="#60a5fa"]');
  act(() => triangle?.click());
  act(() => width8?.click());
  act(() => blue?.click());
  expect(session.getSnapshot().defaults.shape).toEqual({
    color: '#60a5fa',
    kind: 'triangle',
    width: 8,
  });
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
  act(() => deselect?.click());
  expect(session.getSnapshot().selectedObjectId).toBeNull();
  act(() => session.select('selected-shape'));
  const parallelogram = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.shape.kind-parallelogram"]'
  );
  act(() => parallelogram?.click());
  expect(session.getSnapshot().document.objects[0]).toMatchObject({
    id: 'selected-shape',
    kind: 'parallelogram',
  });
  act(() => root.unmount());
});

it('shows a deselect-only panel for a selected blur object', () => {
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
  const deselect = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.deselect"]'
  );
  expect(deselect?.title).toBe('content.toolbar.drawingDeselect');
  act(() => deselect?.click());
  expect(session.getSnapshot().selectedObjectId).toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.blur"]')).toBeNull();
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

  const width44 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.marker.width-44"]'
  );
  const opacity30 = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.toolbar.drawing-options.marker.opacity-30"]'
  );
  const green = host.querySelector<HTMLButtonElement>('button[title="#22c55e"]');
  act(() => width44?.click());
  act(() => opacity30?.click());
  act(() => green?.click());
  expect(session.getSnapshot().defaults.marker).toMatchObject({
    color: '#22c55e',
    opacity: 0.3,
    width: 44,
  });
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.marker"]')).not.toBeNull();
  act(() => root.unmount());
});

it('keeps Drawing options inside right and bottom viewport edges under page zoom', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('innerWidth', 600);
  vi.stubGlobal('innerHeight', 400);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
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
  });
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
