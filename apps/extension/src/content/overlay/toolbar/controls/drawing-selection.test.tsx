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

function renderSelectionToolbar(session: ReturnType<typeof createDrawingSession>) {
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
  expect(panel?.querySelector('[data-ui="content.toolbar.drawing-options.delete"]')).not.toBeNull();
  expect(
    panel?.querySelector('[data-ui="content.toolbar.drawing-options.deselect"]')
  ).not.toBeNull();
  act(() => panel?.querySelector<HTMLButtonElement>('button[title="#60a5fa"]')?.click());

  expect(onDocumentCommit).toHaveBeenCalledTimes(1);
  expect(
    session
      .getSnapshot()
      .document.objects.map((object) => ('color' in object ? object.color : null))
  ).toEqual(['#60a5fa', '#60a5fa']);
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
