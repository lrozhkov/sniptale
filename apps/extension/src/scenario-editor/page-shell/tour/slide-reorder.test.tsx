// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTourSlideReorder } from './slide-reorder';
let host: HTMLDivElement;
let root: Root;
const commit = vi.fn();
function Probe({ disabled = false }: { disabled?: boolean }) {
  const start = useTourSlideReorder('first:second:third', disabled, commit);
  return (
    <div className="guide-panel-scroll">
      <nav className="tour-slide-list">
        {['first', 'second', 'third'].map((id) => (
          <div key={id} className="tour-slide-row" data-tour-before={id}>
            <button onPointerDown={(event) => start(event, id)}>Move</button>
            <button className="tour-slide-select">{id}</button>
          </div>
        ))}
      </nav>
    </div>
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  commit.mockReset();
  host = document.createElement('div');
  host.className = 'guide-page';
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Probe />));
  const pane = host.querySelector<HTMLElement>('.guide-panel-scroll')!;
  pane.getBoundingClientRect = () => new DOMRect(0, 0, 200, 240);
  host.querySelectorAll<HTMLElement>('.tour-slide-row').forEach((row, index) => {
    row.getBoundingClientRect = () => new DOMRect(0, index * 60, 200, 60);
    const handle = row.querySelector('button')!;
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = vi.fn();
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function pointer(target: EventTarget, type: string, y: number, x = 30) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => {
    target.dispatchEvent(event);
  });
}
function handle(index = 0) {
  return host.querySelectorAll('.tour-slide-row > button:first-child')[index]!;
}
it('previews the slide and a unique destination then commits only on release', () => {
  pointer(handle(), 'pointerdown', 20);
  pointer(window, 'pointermove', 22);
  expect(host.querySelector('.tour-slide-drag-preview')).toBeNull();
  pointer(window, 'pointermove', 165);
  expect(host.querySelector('.tour-slide-drag-preview')?.textContent).toBe('first');
  expect(host.querySelector('.tour-slide-drag-preview')?.parentElement).toBe(host);
  expect(document.documentElement.dataset['tourReordering']).toBe('true');
  expect(host.querySelectorAll('[data-slide-insertion]')).toHaveLength(1);
  expect(
    host.querySelector('[data-tour-before="third"]')?.getAttribute('data-slide-insertion')
  ).toBe('after');
  expect(commit).not.toHaveBeenCalled();
  pointer(window, 'pointerup', 165);
  expect(commit).toHaveBeenCalledExactlyOnceWith('first', undefined);
  expect(host.querySelector('.tour-slide-drag-preview')).toBeNull();
  expect(document.documentElement.hasAttribute('data-tour-reordering')).toBe(false);
});
it('supports the first and intermediate slots without duplicating the original position', () => {
  pointer(handle(2), 'pointerdown', 140);
  pointer(window, 'pointermove', 10);
  expect(
    host.querySelector('[data-tour-before="first"]')?.getAttribute('data-slide-insertion')
  ).toBe('before');
  pointer(window, 'pointerup', 10);
  expect(commit).toHaveBeenLastCalledWith('third', 'first');
  commit.mockClear();
  pointer(handle(), 'pointerdown', 20);
  pointer(window, 'pointermove', 70);
  expect(host.querySelector('[data-slide-insertion]')).toBeNull();
  pointer(window, 'pointermove', 110);
  expect(
    host.querySelector('[data-tour-before="third"]')?.getAttribute('data-slide-insertion')
  ).toBe('before');
  pointer(window, 'pointerup', 110);
  expect(commit).toHaveBeenLastCalledWith('first', 'third');
});
it('cancels on Escape, outside release, pointer cancellation and disabled/unmounted state', () => {
  for (const mode of ['escape', 'outside', 'cancel', 'disabled', 'unmount']) {
    pointer(handle(), 'pointerdown', 20);
    pointer(window, 'pointermove', 165);
    if (mode === 'escape')
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });
    if (mode === 'outside') pointer(window, 'pointerup', 165, 300);
    if (mode === 'cancel') pointer(window, 'pointercancel', 165);
    if (mode === 'disabled') act(() => root.render(<Probe disabled />));
    if (mode === 'unmount') act(() => root.render(null));
    expect(host.querySelector('.tour-slide-drag-preview')).toBeNull();
    expect(host.querySelector('[data-slide-insertion]')).toBeNull();
    expect(document.documentElement.hasAttribute('data-tour-reordering')).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    if (mode === 'disabled') act(() => root.render(<Probe />));
  }
});
