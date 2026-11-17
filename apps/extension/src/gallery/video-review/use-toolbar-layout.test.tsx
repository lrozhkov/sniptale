// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useReviewToolbarLayout } from './use-toolbar-layout';

it('remeasures changed transport width but ignores clock text with unchanged geometry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let frame: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let interval = false;
  const observed = new Map<Element, number | undefined>();
  let resized!: ResizeObserverCallback;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resized = callback;
      }
      observe(target: Element) {
        observed.set(target, undefined);
      }
      disconnect() {
        observed.clear();
      }
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(500);
  const content = vi
    .spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return interval && this.dataset['layout'] === 'balanced' ? 600 : 400;
    });
  function Toolbar() {
    const ref = useReviewToolbarLayout();
    return (
      <div ref={ref}>
        <div data-toolbar-transport>
          {interval ? <button>Clear interval</button> : <span>0:00.00</span>}
        </div>
      </div>
    );
  }
  const emitResize = () => {
    const entries: ResizeObserverEntry[] = [];
    for (const [target, before] of observed) {
      const next = target.hasAttribute('data-toolbar-transport') ? (interval ? 260 : 150) : 500;
      if (next === before) continue;
      observed.set(target, next);
      entries.push({ target, contentRect: new DOMRect(0, 0, next, 32) } as ResizeObserverEntry);
    }
    if (entries.length) resized(entries, { observe() {}, unobserve() {}, disconnect() {} });
  };
  const flushFrame = () => {
    const callback = frame;
    frame = undefined;
    callback?.(0);
  };
  try {
    await act(async () => root.render(<Toolbar />));
    act(() => {
      emitResize();
      flushFrame();
    });
    const text = host.querySelector('span')!.firstChild!;
    await act(async () => {
      text.nodeValue = '0:00.10';
    });
    act(() => emitResize());
    expect(frame).toBeUndefined();
    interval = true;
    await act(async () => root.render(<Toolbar />));
    act(() => {
      emitResize();
      flushFrame();
    });
    expect(host.firstElementChild?.getAttribute('data-layout')).toBe('compact');
    interval = false;
    await act(async () => root.render(<Toolbar />));
    act(() => {
      emitResize();
      flushFrame();
    });
    expect(host.firstElementChild?.getAttribute('data-layout')).toBe('balanced');
  } finally {
    await act(async () => root.unmount());
    width.mockRestore();
    content.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('collapses captions in priority order and restores them after resize or tool changes', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let measure = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = () =>
          callback(
            [
              {
                target: host.firstElementChild!,
                contentRect: new DOMRect(0, 0, available, 32),
              } as ResizeObserverEntry,
            ],
            this
          );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let available = 550;
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement
  ) {
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
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  let measure = () => {};
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        measure = () => {
          available += 1;
          callback(
            [
              {
                target: host.firstElementChild!,
                contentRect: new DOMRect(0, 0, available, 32),
              } as ResizeObserverEntry,
            ],
            this
          );
        };
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let gap = 80;
  let available = 500;
  let balanced = false;
  const width = vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(() => available);
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
