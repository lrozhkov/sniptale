// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGuideInsertPlacement } from './document-insert-placement';

let host: HTMLDivElement;
let root: Root;
let resize: () => void;
const disconnect = vi.fn();
const bounds = new Map<string, DOMRect>();
function Surface({ ids = ['a', 'b', 'c'] }: { ids?: string[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const movable = useGuideInsertPlacement(ref);
  return (
    <div ref={ref} data-movable={JSON.stringify(movable)}>
      <div className="guide-step-blocks">
        <div className="guide-block-row" style={{ rowGap: '24px' }}>
          {ids.map((id, index) => (
            <div key={id} className="guide-block" data-block-id={id}>
              <div className="guide-insertion-block" data-insert-before={id} />
              {index === ids.length - 1 && (
                <div className="guide-insertion-block" data-end="true" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const point = (id: string) => host.querySelector<HTMLElement>(`[data-insert-before="${id}"]`)!;
async function flush() {
  await act(async () => vi.runOnlyPendingTimers());
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(callback, 16)
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  bounds.set('a', new DOMRect(100, 100, 200, 160));
  bounds.set('b', new DOMRect(340, 100, 200, 80));
  bounds.set('c', new DOMRect(580, 100, 200, 120));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return bounds.get(this.dataset['blockId'] ?? '') ?? new DOMRect(100, 100, 680, 160);
    }
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  bounds.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('centers one row boundary and places remaining targets between adjacent blocks', async () => {
  await act(async () => root.render(<Surface />));
  await flush();
  expect(point('a').style.left).toBe('0px');
  expect(point('a').style.width).toBe('680px');
  expect(point('a').style.top).toBe('-12px');
  expect(point('b').style.left).toBe('-40px');
  expect(point('b').style.width).toBe('40px');
  expect(point('b').style.top).toBe('40px');
  expect(point('c').style.left).toBe('-40px');
  expect(point('c').style.top).toBe('40px');
  const end = host.querySelector<HTMLElement>('[data-end="true"]')!;
  expect(end.style.left).toBe('-480px');
  expect(end.style.width).toBe('680px');
  expect(end.style.top).toBe('172px');
});
it('repositions wrapping rows and newly inserted blocks and disconnects on unmount', async () => {
  await act(async () => root.render(<Surface />));
  bounds.set('c', new DOMRect(100, 284, 200, 120));
  resize();
  await flush();
  expect(point('a').style.width).toBe('440px');
  expect(point('c').style.left).toBe('0px');
  expect(point('c').style.width).toBe('200px');
  expect(point('c').style.top).toBe('-12px');
  bounds.set('d', new DOMRect(340, 284, 200, 100));
  await act(async () => root.render(<Surface ids={['a', 'b', 'c', 'd']} />));
  await flush();
  expect(point('c').style.width).toBe('440px');
  expect(point('d').style.left).toBe('-40px');
  expect(point('d').style.top).toBe('50px');
  await act(async () => root.render(null));
  expect(disconnect).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it('offers a row break only after a preceding block in the actual wrapped row', async () => {
  await act(async () => root.render(<Surface />));
  await flush();
  expect(JSON.parse(host.firstElementChild!.getAttribute('data-movable')!)).toEqual(['b', 'c']);
  bounds.set('c', new DOMRect(100, 284, 200, 120));
  resize();
  await flush();
  expect(JSON.parse(host.firstElementChild!.getAttribute('data-movable')!)).toEqual(['b']);
});

it('offers removing an explicit break only when the preceding row has room', async () => {
  function SplitSurface() {
    const ref = useRef<HTMLDivElement>(null);
    const movable = useGuideInsertPlacement(ref);
    return (
      <div ref={ref} data-movable={JSON.stringify(movable)}>
        <div className="guide-step-blocks">
          {['a', 'b'].map((id) => (
            <div key={id} className="guide-block-row" style={{ columnGap: '40px' }}>
              <div className="guide-block" data-block-id={id} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  bounds.set('b', new DOMRect(100, 284, 200, 80));
  await act(async () => root.render(<SplitSurface />));
  await flush();
  expect(JSON.parse(host.firstElementChild!.getAttribute('data-movable')!)).toEqual(['b']);
  bounds.set('a', new DOMRect(100, 100, 680, 160));
  resize();
  await flush();
  expect(JSON.parse(host.firstElementChild!.getAttribute('data-movable')!)).toEqual([]);
});
