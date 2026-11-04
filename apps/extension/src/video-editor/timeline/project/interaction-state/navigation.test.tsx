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
    Object.defineProperty(node, 'clientHeight', { configurable: true, value: 200 });
    Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 400 });
    const vertical = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    act(() => node.dispatchEvent(vertical));
    expect(vertical.defaultPrevented).toBe(false);
    Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 200 });
    const forward = new WheelEvent('wheel', { deltaY: 96, cancelable: true });
    act(() => node.dispatchEvent(forward));
    expect(forward.defaultPrevented).toBe(true);
    expect(navigation.projection.startTime).toBeCloseTo(1 / 240, 10);
    act(() => node.dispatchEvent(new WheelEvent('wheel', { deltaY: -192, cancelable: true })));
    expect(navigation.projection.startTime).toBe(0);
    Object.defineProperty(node, 'scrollHeight', { configurable: true, value: 400 });
    const controlled = new WheelEvent('wheel', {
      deltaY: 96,
      ctrlKey: true,
      cancelable: true,
    });
    act(() => node.dispatchEvent(controlled));
    expect(controlled.defaultPrevented).toBe(true);
    expect(navigation.projection.startTime).toBeCloseTo(1 / 240, 10);
    act(() => navigation.navigateTo(0));
    const mixedAxes = new WheelEvent('wheel', {
      deltaX: 32,
      deltaY: 96,
      ctrlKey: true,
      cancelable: true,
    });
    act(() => node.dispatchEvent(mixedAxes));
    expect(mixedAxes.defaultPrevented).toBe(true);
    expect(node.scrollTop).toBe(0);
    expect(navigation.projection.startTime).toBeCloseTo(1 / 240, 10);
    const meta = new WheelEvent('wheel', { deltaY: 96, metaKey: true, cancelable: true });
    act(() => node.dispatchEvent(meta));
    expect(meta.defaultPrevented).toBe(false);
    expect(navigation.projection.startTime).toBeCloseTo(1 / 240, 10);
    act(() => navigation.navigateTo(0));
    const shifted = new WheelEvent('wheel', { deltaY: 96, shiftKey: true, cancelable: true });
    act(() => node.dispatchEvent(shifted));
    expect(shifted.defaultPrevented).toBe(true);
    expect(navigation.projection.startTime).toBeCloseTo(1 / 240, 10);
    act(() => root.unmount());
    const afterUnmount = new WheelEvent('wheel', { deltaX: 96, cancelable: true });
    node.dispatchEvent(afterUnmount);
    expect(afterUnmount.defaultPrevented).toBe(false);
  } finally {
    container.remove();
  }
});

it('retains projection identity across parent clock commits with unchanged geometry', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let navigation!: ReturnType<typeof useTimelineNavigation>;
  function Harness({ time }: { time: number }) {
    const timelineRef = useRef<HTMLDivElement | null>(null);
    navigation = useTimelineNavigation({
      extentSeconds: 100,
      pixelsPerSecond: 10,
      viewportWidth: 100,
      timelineRef,
    });
    return <div ref={timelineRef} data-time={time} />;
  }
  try {
    act(() => root.render(<Harness time={0} />));
    const first = navigation.projection;
    act(() => root.render(<Harness time={1} />));
    expect(container.firstElementChild?.getAttribute('data-time')).toBe('1');
    expect(navigation.projection).toBe(first);
    act(() => navigation.navigateTo(12.25));
    const moved = navigation.projection;
    act(() => root.render(<Harness time={2} />));
    expect(navigation.projection).toBe(moved);
    expect(navigation.readStartTime()).toBe(12.25);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});

it('invalidates projection on zoom, viewport, extent and precise navigation changes', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  let navigation!: ReturnType<typeof useTimelineNavigation>;
  function Harness({
    zoom = 10,
    width = 100,
    extent = 100,
  }: {
    zoom?: number;
    width?: number;
    extent?: number;
  }) {
    const timelineRef = useRef<HTMLDivElement | null>(null);
    navigation = useTimelineNavigation({
      extentSeconds: extent,
      pixelsPerSecond: zoom,
      viewportWidth: width,
      timelineRef,
    });
    return <div ref={timelineRef} />;
  }
  try {
    act(() => root.render(<Harness />));
    const initial = navigation.projection;
    act(() => navigation.navigateTo(12.25));
    expect(navigation.projection).not.toBe(initial);
    expect(navigation.projection.startTime).toBe(12.25);
    const moved = navigation.projection;
    act(() => root.render(<Harness zoom={20} />));
    expect(navigation.projection).not.toBe(moved);
    expect(navigation.projection.endTime).toBe(17.25);
    const zoomed = navigation.projection;
    act(() => root.render(<Harness zoom={20} width={200} />));
    expect(navigation.projection).not.toBe(zoomed);
    expect(navigation.projection.endTime).toBe(22.25);
    const resized = navigation.projection;
    act(() => root.render(<Harness zoom={20} width={200} extent={200} />));
    expect(navigation.projection).not.toBe(resized);
    expect(navigation.projection.maxStartTime).toBe(190);
    expect(navigation.readStartTime()).toBe(12.25);
  } finally {
    act(() => root.unmount());
    container.remove();
  }
});
