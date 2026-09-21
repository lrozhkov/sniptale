// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewTimelineLabel } from './timeline-label';

it('drops whole label parts in priority order and recomputes on resize/content changes', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let width = 160;
  let measure = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        measure = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const part = this.dataset['labelPart'];
      return new DOMRect(
        0,
        0,
        part === 'icon' ? 12 : part === 'name' ? 90 : part === 'value' ? 28 : width,
        14
      );
    }
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const render = (value?: string) =>
    act(() => root.render(<ReviewTimelineLabel icon={<svg />} name="Громкость" value={value} />));
  try {
    render('150%');
    const label = host.firstElementChild as HTMLElement;
    expect(label.dataset['mode']).toBe('full');
    for (const [available, mode] of [
      [60, 'compact'],
      [30, 'value'],
      [20, 'ellipsis'],
      [160, 'full'],
    ] as const) {
      act(() => {
        width = available;
        measure();
      });
      expect(label.dataset['mode']).toBe(mode);
      expect(label.querySelector('[data-label-part="value"]')!.textContent).toBe('150%');
    }
    width = 15;
    render();
    expect(label.dataset['mode']).toBe('compact');
    act(() => {
      width = 8;
      measure();
    });
    expect(label.dataset['mode']).toBe('ellipsis');
  } finally {
    act(() => root.unmount());
    expect(disconnect).toHaveBeenCalled();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
