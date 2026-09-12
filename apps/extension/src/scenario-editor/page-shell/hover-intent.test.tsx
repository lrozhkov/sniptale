// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuideHoverIntent } from './hover-intent';

let host: HTMLDivElement;
let root: Root;
function Fixture() {
  const ref = useGuideHoverIntent();
  return (
    <div ref={ref}>
      <div className="scroll">
        <article>
          <div className="guide-block" id="first">
            <span className="guide-voice-field">
              <input />
            </span>
            <button>Grip</button>
          </div>
          <div className="guide-block" id="second" />
        </article>
      </div>
    </div>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Fixture />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function move(selector: string, pointerType = 'mouse', buttons = 0) {
  const event = new Event('pointermove', { bubbles: true });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    buttons: { value: buttons },
    clientX: { value: 10 },
    clientY: { value: 10 },
  });
  host.querySelector(selector)!.dispatchEvent(event);
}
const visible = (selector: string) =>
  host.querySelector(selector)!.hasAttribute('data-guide-hover');
it('waits for a pause, cancels fast passes, and keeps revealed parent contexts while entering tools', () => {
  move('input');
  vi.advanceTimersByTime(60);
  move('#second');
  vi.advanceTimersByTime(99);
  expect(visible('#first')).toBe(false);
  expect(visible('#second')).toBe(false);
  vi.advanceTimersByTime(1);
  expect(visible('#second')).toBe(true);
  expect(visible('article')).toBe(true);
  move('input');
  vi.advanceTimersByTime(100);
  expect(visible('#first')).toBe(true);
  move('button');
  expect(visible('#first')).toBe(true);
  expect(visible('article')).toBe(true);
  expect(visible('.guide-voice-field')).toBe(false);
});
it('suppresses scroll-time hover and resolves the element under the stationary pointer after scrolling', () => {
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => host.querySelector('#second')),
  });
  move('#first');
  vi.advanceTimersByTime(100);
  host.querySelector('.scroll')!.dispatchEvent(new Event('scroll'));
  expect(visible('#first')).toBe(false);
  vi.advanceTimersByTime(80);
  host.querySelector('.scroll')!.dispatchEvent(new Event('scroll'));
  vi.advanceTimersByTime(99);
  expect(visible('#second')).toBe(false);
  vi.advanceTimersByTime(1);
  expect(visible('#second')).toBe(true);
});
it('cancels pending intent on leave and unmount, and ignores touch or active dragging', () => {
  move('#first', 'touch');
  vi.advanceTimersByTime(100);
  expect(visible('#first')).toBe(false);
  move('#first');
  host.firstElementChild!.dispatchEvent(new Event('pointerleave'));
  vi.advanceTimersByTime(100);
  expect(visible('#first')).toBe(false);
  move('#first');
  vi.advanceTimersByTime(100);
  move('#first', 'mouse', 1);
  expect(visible('#first')).toBe(false);
  move('#first');
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});
