// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useWaveformViewport } from './use-waveform-viewport';

it('tracks the visible portion through scroll and resize and releases observers', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const disconnect = vi.fn();
  const observe = vi.fn();
  let resized!: () => void;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
  );
  let left = 0;
  let width = 2000;
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(left, 0, width, 32)
  );
  const host = document.createElement('div');
  host.dataset['ui'] = 'gallery.videoReview.timelineViewport';
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 32));
  const removed = vi.spyOn(host, 'removeEventListener');
  const root = createRoot(host);
  let value!: ReturnType<typeof useWaveformViewport>;
  function Harness() {
    value = useWaveformViewport();
    return <svg ref={value.ref} />;
  }
  try {
    act(() => root.render(<Harness />));
    expect(value).toMatchObject({ width: 2000, start: 0, end: 0.25 });
    left = -1000;
    act(() => host.dispatchEvent(new Event('scroll')));
    expect(value).toMatchObject({ start: 0.5, end: 0.75 });
    const previous = value;
    act(() => host.dispatchEvent(new Event('scroll')));
    expect(value).toEqual(previous);
    width = 4000;
    act(() => resized());
    expect(value).toMatchObject({ width: 4000, start: 0.25, end: 0.375 });
    expect(observe).toHaveBeenCalledWith(host);
  } finally {
    act(() => root.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledWith('scroll', expect.any(Function));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
