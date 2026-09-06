// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWorkspacePanelSizes, WorkspacePanelResizeHandle } from './panel-layout';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let frameWidth = 1280;
let measure: () => void = () => undefined;
function Harness() {
  const panels = useWorkspacePanelSizes(true);
  return (
    <div ref={panels.containerRef}>
      <WorkspacePanelResizeHandle resize={panels.materials} label="Materials" dataUi="materials" />
      <WorkspacePanelResizeHandle resize={panels.inspector} label="Inspector" dataUi="inspector" />
    </div>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frameWidth = 1280;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, frameWidth, 720)
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect() {}
    }
  );
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function pane(side: string) {
  return container.querySelector<HTMLElement>(`[data-ui="${side}"]`)!;
}
function width(side: string) {
  return Number(pane(side).getAttribute('aria-valuenow'));
}
function key(side: string, value: string) {
  act(() => pane(side).dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })));
}
function pointer(target: EventTarget, type: string, clientX: number) {
  act(() => target.dispatchEvent(new MouseEvent(type, { clientX, button: 0, bubbles: true })));
}

it('resizes each pane independently and restores its default with double click or Home', () => {
  key('materials', 'ArrowRight');
  key('inspector', 'ArrowLeft');
  expect(width('materials')).toBe(264);
  expect(width('inspector')).toBe(336);
  act(() => pane('materials').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(width('materials')).toBe(240);
  expect(width('inspector')).toBe(336);
  key('inspector', 'Home');
  expect(width('inspector')).toBe(320);
});

it('keeps a usable HD viewer when both panes expand and the viewport narrows', () => {
  act(() => {
    frameWidth = 1920;
    measure();
  });
  for (let index = 0; index < 12; index += 1) {
    key('materials', 'ArrowRight');
    key('inspector', 'ArrowLeft');
  }
  expect(width('materials')).toBe(360);
  expect(width('inspector')).toBe(520);
  act(() => {
    frameWidth = 1280;
    measure();
  });
  expect(width('inspector')).toBe(280);
  expect(frameWidth - 40 - width('materials') - width('inspector')).toBe(640);
  act(() => {
    frameWidth = 900;
    measure();
  });
  expect(width('inspector')).toBe(280);
});

it('restores the starting width on Escape and stops the cancelled pointer session', () => {
  pointer(pane('materials'), 'pointerdown', 200);
  pointer(window, 'pointermove', 260);
  expect(width('materials')).toBe(300);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(width('materials')).toBe(240);
  pointer(window, 'pointermove', 310);
  expect(width('materials')).toBe(240);
});

function resizeFrame(value: number) {
  act(() => {
    frameWidth = value;
    measure();
  });
}

it('uses roomier automatic pane proportions on Full HD and wide displays', () => {
  resizeFrame(1920);
  expect(width('materials')).toBe(320);
  expect(width('inspector')).toBe(400);
  resizeFrame(2560);
  expect(width('materials')).toBe(360);
  expect(width('inspector')).toBe(440);
  resizeFrame(1280);
  expect(width('materials')).toBe(240);
  expect(width('inspector')).toBe(320);
});

it('preserves manual dimensions until reset resumes automatic sizing', () => {
  resizeFrame(1920);
  key('materials', 'ArrowLeft');
  expect(width('materials')).toBe(296);
  resizeFrame(2560);
  expect(width('materials')).toBe(296);
  key('materials', 'Home');
  expect(width('materials')).toBe(360);
  resizeFrame(1920);
  expect(width('materials')).toBe(320);
});

it('restores automatic sizing when a resize gesture is cancelled', () => {
  pointer(pane('materials'), 'pointerdown', 200);
  pointer(window, 'pointermove', 240);
  act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  resizeFrame(1920);
  expect(width('materials')).toBe(320);
});
