import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { createDrawingSession, type DrawingBounds } from '../../features/drawing/public';
import type { ContentDrawingController } from './controller';
import { DrawingSurface } from './surface';

export function mousePointerEvent(
  type: string,
  clientX: number,
  clientY: number,
  modifiers: MouseEventInit = {}
): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY, ...modifiers });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'mouse' },
  });
  return event;
}

export function setupAlignmentSurface(
  enabled = true,
  kind: 'rectangle' | 'blur' = 'rectangle',
  targetBounds?: DrawingBounds
) {
  preparePointerCanvasEnvironment();
  const { commit, session } = createAlignmentSession(kind, targetBounds);
  const controller: ContentDrawingController = {
    session,
    applyPalette: vi.fn(),
    finalizeInteraction: vi.fn(),
    getPalette: () => ['#f00'],
    getScrollRoot: () => ({ kind: 'viewport', element: null }),
    prepareActivation: () => true,
    registerInteractionFinalizer: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (chromeHidden = false) =>
    act(() =>
      root.render(
        <DrawingSurface
          active
          alignMovesToPage={enabled}
          chromeHidden={chromeHidden}
          controller={controller}
        />
      )
    );
  render();
  const canvas = host.querySelector('canvas')!;
  commit.mockClear();
  return {
    commit,
    session,
    host,
    render,
    event: (type: string, x: number, y: number, modifiers: MouseEventInit = {}) =>
      act(() => canvas.dispatchEvent(mousePointerEvent(type, x, y, modifiers))),
    moving: () => session.getSnapshot().document.objects.find((object) => object.id === 'moving'),
    dispose: () => act(() => root.unmount()),
  };
}

function preparePointerCanvasEnvironment() {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
}

function createAlignmentSession(kind: 'rectangle' | 'blur', targetBounds?: DrawingBounds) {
  const commit = vi.fn(() => true);
  const session = createDrawingSession({ onDocumentCommit: commit });
  session.commitObject({
    id: 'target',
    kind: 'rectangle',
    bounds: targetBounds ?? { x: 300, y: 200, width: 200, height: 160 },
    color: '#f00',
    fillColor: '#f00',
    width: 2,
  });
  session.commitObject({
    id: 'moving',
    kind,
    bounds: { x: 80, y: 80, width: 80, height: 60 },
    color: '#f00',
    fillColor: '#f00',
    width: 2,
  });
  session.setActiveTool('select');
  session.select('moving');
  return { commit, session };
}
