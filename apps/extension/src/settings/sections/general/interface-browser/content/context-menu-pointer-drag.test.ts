// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { bindContextMenuPointerDrag } from './context-menu-pointer-drag';

let root: HTMLDivElement;
let source: HTMLButtonElement;
let dispose: () => void;
let hit: Element | null;
let tick: FrameRequestCallback;
const callbacks = { accept: vi.fn(() => true), move: vi.fn(), commit: vi.fn(), end: vi.fn() };
function pointer(target: EventTarget, type: string, x: number, y: number, pointerId = 1) {
  target.dispatchEvent(
    Object.assign(
      new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }),
      { pointerId, isPrimary: true }
    )
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  root = document.createElement('div');
  source = document.createElement('button');
  source.dataset['contextMenuSource'] = 'catalog';
  source.dataset['commandKey'] = 'command:test';
  source.textContent = 'Entire command';
  root.append(source);
  document.body.append(root);
  hit = source;
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => hit });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    tick = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  root.setPointerCapture = vi.fn();
  dispose = bindContextMenuPointerDrag(root, callbacks);
});
afterEach(() => {
  dispose();
  root.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'elementFromPoint');
});
it('keeps clicks below the drag threshold and suppresses only the post-drag click', () => {
  const click = vi.fn();
  source.addEventListener('click', click);
  pointer(source, 'pointerdown', 20, 20);
  pointer(window, 'pointermove', 22, 22);
  pointer(window, 'pointerup', 22, 22);
  source.click();
  expect(click).toHaveBeenCalledTimes(1);
  expect(root.setPointerCapture).not.toHaveBeenCalled();
  expect(callbacks.commit).not.toHaveBeenCalled();
  pointer(source, 'pointerdown', 20, 20);
  pointer(window, 'pointermove', 40, 40);
  expect(root.querySelector('.context-menu-drag-preview')?.textContent).toBe('Entire command');
  expect(root.hasAttribute('data-context-menu-dragging')).toBe(true);
  expect(root.setPointerCapture).toHaveBeenCalledExactlyOnceWith(1);
  pointer(window, 'pointerup', 40, 40);
  source.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  expect(callbacks.commit).toHaveBeenCalledTimes(1);
  expect(click).toHaveBeenCalledTimes(1);
  pointer(source, 'pointerdown', 20, 20);
  pointer(window, 'pointerup', 20, 20);
  source.click();
  expect(click).toHaveBeenCalledTimes(2);
});
it.each(['Escape', 'pointercancel', 'lostpointercapture', 'blur', 'unmount'])(
  'cleans preview, source and frame on %s',
  (kind) => {
    pointer(source, 'pointerdown', 20, 20);
    pointer(window, 'pointermove', 40, 40);
    if (kind === 'Escape')
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    else if (kind === 'unmount') dispose();
    else if (kind === 'lostpointercapture') root.dispatchEvent(new Event(kind));
    else window.dispatchEvent(new Event(kind));
    expect(root.querySelector('.context-menu-drag-preview')).toBeNull();
    expect(root.hasAttribute('data-context-menu-dragging')).toBe(false);
    expect(source.hasAttribute('data-context-menu-moving')).toBe(false);
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
    pointer(window, 'pointerup', 40, 40);
    expect(callbacks.commit).not.toHaveBeenCalled();
  }
);
it('ignores unrelated pointers and scrolls the hovered list while the pointer is stationary', () => {
  const scroller = document.createElement('div');
  scroller.dataset['contextMenuScroll'] = '';
  root.append(scroller);
  hit = scroller;
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 200,
    left: 0,
    right: 300,
    width: 300,
    height: 200,
    x: 0,
    y: 0,
    toJSON: () => undefined,
  });
  pointer(source, 'pointerdown', 20, 20);
  pointer(window, 'pointermove', 100, 190, 2);
  expect(root.querySelector('.context-menu-drag-preview')).toBeNull();
  pointer(window, 'pointermove', 100, 190);
  pointer(window, 'pointercancel', 100, 190, 2);
  tick(16);
  expect(scroller.scrollTop).toBeGreaterThan(0);
  pointer(window, 'pointerup', 100, 190, 2);
  expect(callbacks.commit).not.toHaveBeenCalled();
  pointer(window, 'pointerup', 100, 190);
  expect(callbacks.commit).toHaveBeenCalledOnce();
});

it.each(['blur', 'pointercancel'])(
  'preserves keyboard activation after %s without a trailing pointer click',
  (kind) => {
    const click = vi.fn();
    source.addEventListener('click', click);
    pointer(source, 'pointerdown', 20, 20);
    pointer(window, 'pointermove', 40, 40);
    window.dispatchEvent(new Event(kind));
    source.click();
    expect(click).toHaveBeenCalledOnce();
  }
);
