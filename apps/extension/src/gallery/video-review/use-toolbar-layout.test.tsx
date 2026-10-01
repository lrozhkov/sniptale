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

it('shows the autosave divider only when compact controls are physically close', async () => {
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
  let gap = 80;
  let balanced = false;
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
  const content = vi
    .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.dataset['layout'] === 'balanced' && !balanced ? 600 : 400;
    });
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('data-ui') === 'autosave-control') return new DOMRect(100, 0, 32, 32);
      if (this.tagName === 'INPUT') return new DOMRect(132 + gap, 0, 0, 32);
      return new DOMRect(0, 0, 500, 32);
    });
  function Toolbar() {
    const ref = useReviewToolbarLayout();
    return (
      <div ref={ref}>
        <div data-toolbar-side="trailing">
          <button data-ui="autosave-control">Autosave</button>
          <span data-compact-only />
          <input type="range" />
        </div>
      </div>
    );
  }
  try {
    await act(async () => root.render(<Toolbar />));
    const toolbar = host.firstElementChild as HTMLElement;
    expect(toolbar.dataset['layout']).toBe('compact');
    expect(toolbar.dataset['autosaveDivider']).toBeUndefined();
    gap = 8;
    act(() => measure());
    expect(toolbar.dataset['autosaveDivider']).toBe('shown');
    for (let attempt = 0; attempt < 3; attempt++) act(() => measure());
    expect(toolbar.dataset['autosaveDivider']).toBe('shown');
    gap = 80;
    act(() => measure());
    expect(toolbar.dataset['autosaveDivider']).toBeUndefined();
    gap = 8;
    balanced = true;
    act(() => measure());
    expect(toolbar.dataset['layout']).toBe('balanced');
    expect(toolbar.dataset['autosaveDivider']).toBeUndefined();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    width.mockRestore();
    content.mockRestore();
    bounds.mockRestore();
    vi.unstubAllGlobals();
  }
});
