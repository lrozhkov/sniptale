// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDrawingSession } from '../../features/drawing/public';
import { createContentDrawingController, type ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';
import { initializeContentUiRoots } from '../platform/dom-host';

const trustedEventMocks = vi.hoisted(() => ({
  isTrustedKeyboardEvent: vi.fn(() => true),
}));
vi.mock('../platform/trusted-events', () => trustedEventMocks);

beforeEach(() => {
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(true);
});

vi.mock('../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../platform/dom-host')>()),
  toggleContentHostClass: vi.fn(),
}));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('rejects synthetic drawing keyboard commands', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  trustedEventMocks.isTrustedKeyboardEvent.mockReturnValue(false);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  const deleteSelected = vi.spyOn(session, 'deleteSelected');
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#ef4444'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DrawingSurface active chromeHidden={false} controller={controller} />));
  const canvas = host.querySelector('canvas');

  act(() =>
    canvas?.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'Delete' })
    )
  );

  expect(deleteSelected).not.toHaveBeenCalled();
  act(() => root.unmount());
});

it('owns Escape and Delete while focus remains on content toolbar chrome', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const session = createDrawingSession({ onDocumentCommit: () => true });
  session.setActiveTool('arrow');
  const deleteSelected = vi.spyOn(session, 'deleteSelected');
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#ef4444'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const contentHost = document.createElement('div');
  contentHost.setAttribute('role', 'dialog');
  contentHost.setAttribute('aria-expanded', 'true');
  document.body.append(contentHost);
  const { appContainer } = initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const root = createRoot(appContainer);
  act(() =>
    root.render(
      <>
        <DrawingSurface active chromeHidden={false} controller={controller} />
        <div data-ui="shared.ui.content-toolbar">
          <button data-ui="test.drawing-toolbar-button" />
        </div>
      </>
    )
  );
  const toolbarButton = appContainer.querySelector<HTMLButtonElement>(
    '[data-ui="test.drawing-toolbar-button"]'
  )!;
  toolbarButton.focus();

  act(() =>
    toolbarButton.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'Delete' })
    )
  );
  act(() =>
    toolbarButton.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, composed: true, key: 'Escape' })
    )
  );

  expect(deleteSelected).toHaveBeenCalledOnce();
  expect(session.getSnapshot().activeTool).toBe('select');
  act(() => root.unmount());
});

it('defers Escape to an active floating toolbar layer', () => {
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
  const contentHost = document.createElement('div');
  document.body.append(contentHost);
  const { appContainer } = initializeContentUiRoots(contentHost.attachShadow({ mode: 'open' }));
  const root = createRoot(appContainer);
  act(() =>
    root.render(
      <>
        <DrawingSurface active chromeHidden={false} controller={controller} />
        <div data-ui="shared.ui.content-toolbar">
          <div data-open="true" data-ui="shared.ui.color-selector">
            <button data-ui="test.color-trigger" />
          </div>
        </div>
      </>
    )
  );
  const trigger = appContainer.querySelector<HTMLButtonElement>('[data-ui="test.color-trigger"]')!;
  const dismissLayer = vi.fn((event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  });
  document.addEventListener('keydown', dismissLayer, { capture: true });

  act(() =>
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        key: 'Escape',
      })
    )
  );

  expect(session.getSnapshot().activeTool).toBe('arrow');
  expect(dismissLayer).toHaveBeenCalledOnce();
  document.removeEventListener('keydown', dismissLayer, { capture: true });
  act(() => root.unmount());
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
  const pageDialog = document.createElement('div');
  pageDialog.setAttribute('role', 'dialog');
  const pageButton = document.createElement('button');
  const host = document.createElement('div');
  pageDialog.append(pageButton);
  document.body.append(pageDialog, host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <DrawingSurface active chromeHidden={false} controller={controller} onExit={onExit} />
    )
  );
  pageButton.focus();
  const hostKeyGuard = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' && event.key !== 'Delete') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener('keydown', hostKeyGuard, { capture: true });

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

  const deleteSelected = vi.spyOn(session, 'deleteSelected');
  act(() =>
    canvas.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete' })
    )
  );
  expect(deleteSelected).toHaveBeenCalledOnce();

  act(() =>
    pageButton.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
  );
  expect(onExit).toHaveBeenCalledOnce();
  document.removeEventListener('keydown', hostKeyGuard, { capture: true });
  window.removeEventListener('keydown', shiftBubble);
  act(() => root.unmount());
});

it('returns recording drawing directly to navigation on the first Escape', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const controller = createContentDrawingController(
    createDrawingSession({ onDocumentCommit: () => true })
  );
  controller.session.setActiveTool('pencil');
  const onExit = vi.fn();
  act(() =>
    root.render(
      <DrawingSurface
        active
        chromeHidden={false}
        controller={controller}
        escapeImmediately
        onExit={onExit}
      />
    )
  );

  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })));

  expect(controller.session.getSnapshot().activeTool).toBe('select');
  expect(onExit).toHaveBeenCalledOnce();
  act(() => root.unmount());
  controller.session.dispose();
});
