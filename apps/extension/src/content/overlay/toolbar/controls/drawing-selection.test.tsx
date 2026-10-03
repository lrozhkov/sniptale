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

function renderSelectionToolbar(
  session: ReturnType<typeof createDrawingSession>,
  displayMode: 'horizontal' | 'vertical' = 'horizontal'
) {
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
    root.render(<ToolbarDrawingControls controller={controller} displayMode={displayMode} />)
  );
  return { host, root };
}

it('shows only the shared stroke color for a mixed multi-selection and updates it atomically', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const onDocumentCommit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  session.commitObject({
    color: '#ef4444',
    id: 'pencil',
    kind: 'pencil',
    samples: [
      { x: 0, y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
    ],
    width: 4,
  });
  session.commitObject({
    bounds: { x: 40, y: 0, width: 30, height: 30 },
    color: '#ef4444',
    id: 'shape',
    kind: 'rectangle',
    width: 8,
  });
  session.setActiveTool('select');
  session.setSelection(['pencil', 'shape']);
  onDocumentCommit.mockClear();
  const { host, root } = renderSelectionToolbar(session);

  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.selection"]');
  expect(panel?.querySelector('[data-ui*=".width-"]')).toBeNull();
  expect(panel?.querySelector('[data-ui="drawing.selection.actions.delete"]')).toBeNull();
  expect(host.querySelector('[data-ui="drawing.selection.actions.delete"]')).not.toBeNull();
  expect(host.querySelector('[data-ui="content.toolbar.drawing-options.deselect"]')).not.toBeNull();
  expect(host.querySelectorAll('.sniptale-drawing-options-popover')).toHaveLength(2);
  expect(panel?.querySelectorAll('.grid-cols-5 button[title^="#"]')).toHaveLength(5);
  expect(panel?.querySelector('.grid-cols-5')).not.toBeNull();
  act(() => panel?.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());

  expect(onDocumentCommit).toHaveBeenCalledTimes(1);
  expect(
    session
      .getSnapshot()
      .document.objects.map((object) => ('color' in object ? object.color : null))
  ).toEqual(['#60a5fa', '#60a5fa']);
  act(() => root.unmount());
});

it('uses the effective alpha for a mixed legacy marker selection', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const onDocumentCommit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  session.commitObject({
    color: '#ffff00',
    id: 'marker',
    kind: 'marker',
    opacity: 0.3,
    samples: [
      { x: 0, y: 0, t: 0 },
      { x: 20, y: 0, t: 10 },
    ],
    width: 12,
  });
  session.commitObject({
    color: '#ffff00',
    id: 'pencil',
    kind: 'pencil',
    samples: [
      { x: 0, y: 20, t: 0 },
      { x: 20, y: 20, t: 10 },
    ],
    width: 4,
  });
  session.setActiveTool('select');
  session.setSelection(['marker', 'pencil']);
  onDocumentCommit.mockClear();
  const { host, root } = renderSelectionToolbar(session);
  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.selection"]');
  const picker = panel?.querySelector<HTMLButtonElement>(
    '[data-ui="shared.ui.color-selector.picker-trigger"]'
  );
  expect(picker?.title).toBe('#FFFF004D');
  act(() => panel?.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());
  expect(session.getSnapshot().document.objects).toMatchObject([
    { color: '#60a5fa4d', kind: 'marker', opacity: 1 },
    { color: '#60a5fa4d', kind: 'pencil' },
  ]);
  expect(onDocumentCommit).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
});

it('moves and duplicates a selected page drawing from the separate action panel', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const commits = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit: commits });
  for (const id of ['one', 'two']) {
    session.commitObject({ id, kind: 'blur', bounds: { x: 0, y: 0, width: 10, height: 10 } });
  }
  session.setActiveTool('select');
  session.select('one');
  commits.mockClear();
  const { host, root } = renderSelectionToolbar(session);
  act(() =>
    host.querySelector<HTMLButtonElement>('[data-ui="drawing.selection.actions.front"]')?.click()
  );
  expect(session.getSnapshot().document.objects.map((object) => object.id)).toEqual(['two', 'one']);
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[data-ui="drawing.selection.actions.duplicate"]')
      ?.click()
  );
  expect(session.getSnapshot().document.objects).toHaveLength(3);
  expect(commits).toHaveBeenCalledTimes(2);
  act(() => root.unmount());
});

it('shows shared shape properties and changes both selected shapes in one commit', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const onDocumentCommit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit });
  session.commitObject({
    bounds: { x: 0, y: 0, width: 30, height: 30 },
    color: '#ef4444',
    id: 'rectangle',
    kind: 'rectangle',
    width: 4,
  });
  session.commitObject({
    bounds: { x: 50, y: 0, width: 30, height: 30 },
    color: '#ef4444',
    id: 'ellipse',
    kind: 'ellipse',
    width: 4,
  });
  session.setActiveTool('select');
  session.setSelection(['rectangle', 'ellipse']);
  onDocumentCommit.mockClear();
  const { host, root } = renderSelectionToolbar(session);

  const panel = host.querySelector('[data-ui="content.toolbar.drawing-options.selection"]');
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.fill"]')
  ).not.toBeNull();
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.shape.width-4"]')
  ).not.toBeNull();
  act(() =>
    panel
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="content.toolbar.drawing-options.shape.kind-triangle"]'
      )
      ?.click()
  );

  expect(onDocumentCommit).toHaveBeenCalledTimes(1);
  expect(session.getSnapshot().document.objects.map((object) => object.kind)).toEqual([
    'triangle',
    'triangle',
  ]);
  act(() => root.unmount());
});

it.each([
  ['vertical', 20, true],
  ['vertical', 950, true],
  ['horizontal', 20, false],
] as const)(
  'keeps selected actions adjacent to the %s toolbar at x=%s',
  (mode, x, actionsFirst) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('innerWidth', 1024);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(x, 100, 36, 36)
    );
    const session = createDrawingSession({ onDocumentCommit: () => true });
    session.commitObject({
      id: 'selected',
      kind: 'blur',
      bounds: { x: 0, y: 0, width: 40, height: 40 },
    });
    session.setActiveTool('select');
    session.select('selected');
    const { host, root } = renderSelectionToolbar(session, mode);
    act(() => window.dispatchEvent(new Event('resize')));
    const pair = host.querySelector('[data-ui="content.toolbar.drawing-options.pair"]');
    const action = host.querySelector('[data-ui="drawing.selection.actions.delete"]');
    expect(pair?.children).toHaveLength(2);
    expect(pair?.classList.contains('flex-col')).toBe(mode === 'vertical');
    expect(pair?.children[0]?.contains(action)).toBe(actionsFirst);
    expect(pair?.children[1]?.contains(action)).toBe(!actionsFirst);
    if (mode === 'vertical') {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(x === 20 ? 950 : 20, 100, 36, 36)
      );
      act(() => window.dispatchEvent(new Event('resize')));
      expect(pair?.children[0]?.contains(action)).toBe(actionsFirst);
      expect(host.querySelector('[data-ui="drawing.selection.actions.delete"]')).toBe(action);
    }
    act(() => root.unmount());
  }
);
