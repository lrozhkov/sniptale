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

it('exposes all direct tools and the editor-parity 16px pencil size', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const session = createDrawingSession();
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
  act(() => root.render(<ToolbarDrawingControls controller={controller} />));
  expect(host.querySelectorAll('[data-ui^="content.toolbar.drawing."]')).toHaveLength(8);
  const width = host.querySelector<HTMLSelectElement>(
    'select[aria-label="content.toolbar.drawingWidth"]'
  );
  expect(Array.from(width?.options ?? []).map((option) => option.value)).toEqual([
    '2',
    '4',
    '8',
    '16',
  ]);
  act(() => root.unmount());
});
