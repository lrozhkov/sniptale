// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
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

it('owns Escape outside the canvas without exposing the browser default focus frame', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.setActiveTool('arrow');
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#ef4444'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const onExit = vi.fn();
  const pageButton = document.createElement('button');
  const host = document.createElement('div');
  document.body.append(pageButton, host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <DrawingSurface active chromeHidden={false} controller={controller} onExit={onExit} />
    )
  );
  pageButton.focus();

  const canvas = host.querySelector('canvas')!;
  expect(canvas.classList).toContain('sniptale-drawing-canvas');
  const shiftBubble = vi.fn();
  window.addEventListener('keydown', shiftBubble);
  act(() => canvas.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Shift' })));
  expect(shiftBubble).not.toHaveBeenCalled();

  const selectEscape = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Escape',
  });
  act(() => pageButton.dispatchEvent(selectEscape));
  expect(selectEscape.defaultPrevented).toBe(true);
  expect(session.getSnapshot().activeTool).toBe('select');
  expect(onExit).not.toHaveBeenCalled();

  act(() =>
    pageButton.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(onExit).toHaveBeenCalledOnce();
  window.removeEventListener('keydown', shiftBubble);
  act(() => root.unmount());
});
