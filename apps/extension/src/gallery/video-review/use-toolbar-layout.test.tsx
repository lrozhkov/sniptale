// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewToolbarLayout } from './use-toolbar-layout';

it('collapses captions in priority order and restores them after resize or tool changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let measure = () => {};
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
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let available = 550;
  const width = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return available;
    });
  const content = vi
    .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return (
        200 +
        this.querySelectorAll('[data-toolbar-priority]:not([data-caption-hidden])').length * 50
      );
    });
  function Toolbar({ extra = false }: { extra?: boolean }) {
    const ref = useReviewToolbarLayout();
    return (
      <div ref={ref}>
        <div data-toolbar-side="leading">
          {[0, 1, 2, 3, 4, 5, 6].map((priority) => (
            <button key={priority} data-toolbar-priority={priority}>
              <span data-review-toolbar-label>{priority}</span>
            </button>
          ))}
          {extra ? <button data-toolbar-priority={6}>Extra tool</button> : null}
        </div>
      </div>
    );
  }
  const hidden = () =>
    Array.from(host.querySelectorAll<HTMLElement>('[data-caption-hidden]')).map((button) =>
      Number(button.dataset['toolbarPriority'])
    );
  try {
    await act(async () => root.render(<Toolbar />));
    expect(hidden()).toEqual([]);
    available = 450;
    act(() => measure());
    expect(hidden()).toEqual([0, 1]);
    expect(host.firstElementChild?.getAttribute('data-labels')).toBe('partial');
    await act(async () => root.render(<Toolbar extra />));
    expect(hidden()).toEqual([0, 1, 2]);
    available = 250;
    act(() => measure());
    expect(hidden()).toEqual([0, 1, 2, 3, 4, 5, 6, 6]);
    available = 600;
    act(() => measure());
    expect(hidden()).toEqual([]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    width.mockRestore();
    content.mockRestore();
    vi.unstubAllGlobals();
  }
});
