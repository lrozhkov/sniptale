// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession, resolveDrawingToolCursor } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: vi.fn(),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows the active tool and arrow gesture origin on the page canvas', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const controller: ContentDrawingController = {
    session,
    getPalette: () => ['#ef4444'],
    applyPalette: vi.fn(),
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
    finalizeInteraction: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas')!;

  act(() => session.setActiveTool('arrow'));
  expect(canvas.style.cursor).toBe(resolveDrawingToolCursor('arrow'));
  const defaults = session.getSnapshot().defaults;
  act(() => session.setDefaults({ ...defaults, arrow: { ...defaults.arrow, drawFromTip: true } }));
  expect(canvas.style.cursor).toBe(resolveDrawingToolCursor('arrow', true));
  act(() =>
    canvas.dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 300, clientY: 300 })
    )
  );
  expect(canvas.style.cursor).toBe(resolveDrawingToolCursor('arrow', true));
  act(() => session.setActiveTool('blur'));
  expect(canvas.style.cursor).toBe(resolveDrawingToolCursor('blur'));

  act(() => root.unmount());
});
