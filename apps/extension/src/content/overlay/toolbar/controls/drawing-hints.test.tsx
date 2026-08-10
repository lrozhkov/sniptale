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

it('shows creation modifiers in drawing-tool hints without selection shortcuts', () => {
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
  const title = (tool: string) =>
    host.querySelector(`[data-ui="content.toolbar.drawing.${tool}"]`)?.getAttribute('title');
  const description = (tool: string) => {
    const button = host.querySelector(`[data-ui="content.toolbar.drawing.${tool}"]`);
    const id = button?.getAttribute('aria-describedby');
    return id ? document.getElementById(id)?.textContent : null;
  };

  expect(title('select')).toBe(
    'content.toolbar.drawingSelect\ncontent.toolbar.drawingSelectModifierHint'
  );
  expect(title('pencil')).toBe(
    'content.toolbar.drawingPencil\ncontent.toolbar.drawingStrokeModifierHint'
  );
  expect(title('marker')).toBe(
    'content.toolbar.drawingMarker\ncontent.toolbar.drawingStrokeModifierHint'
  );
  expect(title('text')).toBe(
    'content.toolbar.drawingText\ncontent.toolbar.drawingTextModifierHint'
  );
  expect(title('shape')).toBe(
    'content.toolbar.drawingShape\ncontent.toolbar.drawingShapeModifierHint'
  );
  expect(title('arrow')).toBe(
    'content.toolbar.drawingArrow\ncontent.toolbar.drawingArrowModifierHint'
  );
  expect(title('blur')).toBe('content.toolbar.drawingBlur');
  expect(description('select')).toBe('content.toolbar.drawingSelectModifierHint');
  expect(description('pencil')).toBe('content.toolbar.drawingStrokeModifierHint');
  expect(description('marker')).toBe('content.toolbar.drawingStrokeModifierHint');
  expect(description('text')).toBe('content.toolbar.drawingTextModifierHint');
  expect(description('shape')).toBe('content.toolbar.drawingShapeModifierHint');
  expect(description('arrow')).toBe('content.toolbar.drawingArrowModifierHint');
  expect(description('blur')).toBeNull();
  expect(
    Array.from(host.querySelectorAll('[title]')).every(
      (node) => !node.getAttribute('title')?.includes('Delete')
    )
  ).toBe(true);
  act(() => root.unmount());
});
