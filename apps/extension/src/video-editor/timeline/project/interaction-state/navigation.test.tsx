// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useTimelineNavigation } from './navigation';

it('retains precise time across rounded scroll acknowledgements and wheel events', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let navigation!: ReturnType<typeof useTimelineNavigation>;
  function Harness() {
    const ref = useRef<HTMLDivElement | null>(null);
    navigation = useTimelineNavigation({
      extentSeconds: 86400,
      pixelsPerSecond: 23040,
      viewportWidth: 1000,
      timelineRef: ref,
    });
    return <div ref={ref} />;
  }
  try {
    act(() => root.render(<Harness />));
    const node = container.firstElementChild as HTMLDivElement;
    let roundedLeft = 0;
    Object.defineProperty(node, 'scrollLeft', {
      configurable: true,
      get: () => roundedLeft,
      set: (value) => {
        roundedLeft = Math.round(value);
      },
    });
    const target = 43200 + 1 / 240;
    act(() => navigation.navigateTo(target));
    act(() => node.dispatchEvent(new Event('scroll')));
    expect(navigation.projection.startTime).toBe(target);
    act(() => node.dispatchEvent(new WheelEvent('wheel', { deltaX: 96, cancelable: true })));
    expect(navigation.projection.startTime).toBeCloseTo(target + 1 / 240, 10);
    node.scrollLeft = 0;
    act(() => node.dispatchEvent(new Event('scroll')));
    expect(navigation.projection.startTime).toBe(0);
    const vertical = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    act(() => node.dispatchEvent(vertical));
    expect(vertical.defaultPrevented).toBe(false);
    act(() => root.unmount());
    const afterUnmount = new WheelEvent('wheel', { deltaX: 96, cancelable: true });
    node.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  } finally {
    container.remove();
  }
});
