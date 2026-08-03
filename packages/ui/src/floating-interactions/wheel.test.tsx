// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { RefCallback } from 'react';
import { expect, it, vi } from 'vitest';
import { useFloatingSurfaceWheelContainment } from './wheel';

function WheelSurface(props: {
  forwardedRef: { current: HTMLDivElement | null };
  nodeKey: string;
}) {
  const surfaceRef = useFloatingSurfaceWheelContainment(props.forwardedRef);
  return <div key={props.nodeKey} ref={surfaceRef} data-ui="wheel-surface" />;
}

function dispatchWheel(target: Element) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 80 });
  target.dispatchEvent(event);
  return event;
}

it('moves non-passive wheel ownership when an active surface node is replaced', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const forwardedRef = { current: null as HTMLDivElement | null };

  act(() => root.render(<WheelSurface forwardedRef={forwardedRef} nodeKey="first" />));
  const firstSurface = forwardedRef.current;
  if (!firstSurface) throw new Error('Expected first wheel surface');
  expect(dispatchWheel(firstSurface).defaultPrevented).toBe(true);

  act(() => root.render(<WheelSurface forwardedRef={forwardedRef} nodeKey="second" />));
  const secondSurface = forwardedRef.current;
  if (!secondSurface) throw new Error('Expected replacement wheel surface');
  expect(secondSurface).not.toBe(firstSurface);
  expect(dispatchWheel(firstSurface).defaultPrevented).toBe(false);
  expect(dispatchWheel(secondSurface).defaultPrevented).toBe(true);

  act(() => root.unmount());
  expect(forwardedRef.current).toBeNull();
  expect(dispatchWheel(secondSurface).defaultPrevented).toBe(false);
  container.remove();
  vi.unstubAllGlobals();
});

it('supports callback refs without rebinding the same committed node', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const forwardedRef = vi.fn<(node: HTMLDivElement | null) => void>();
  const containmentRef = { current: null as RefCallback<HTMLDivElement> | null };

  function CallbackRefSurface() {
    containmentRef.current = useFloatingSurfaceWheelContainment(forwardedRef);
    return <div ref={containmentRef.current} />;
  }

  act(() => root.render(<CallbackRefSurface />));
  const surface = container.querySelector('div');
  if (!surface || !containmentRef.current) throw new Error('Expected callback-ref wheel surface');
  containmentRef.current(surface);

  expect(forwardedRef).toHaveBeenLastCalledWith(surface);
  expect(dispatchWheel(surface).defaultPrevented).toBe(true);

  act(() => root.unmount());
  expect(forwardedRef).toHaveBeenLastCalledWith(null);
  container.remove();
  vi.unstubAllGlobals();
});

it('preserves React 19 cleanup-returning callback ref semantics', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const forwardedCleanup = vi.fn();
  const forwardedRef = vi.fn((node: HTMLDivElement | null) =>
    node ? forwardedCleanup : undefined
  );

  function CleanupRefSurface(props: { nodeKey: string }) {
    const surfaceRef = useFloatingSurfaceWheelContainment(forwardedRef);
    return <div key={props.nodeKey} ref={surfaceRef} />;
  }

  act(() => root.render(<CleanupRefSurface nodeKey="first" />));
  act(() => root.render(<CleanupRefSurface nodeKey="second" />));
  expect(forwardedCleanup).toHaveBeenCalledTimes(1);
  expect(forwardedRef).not.toHaveBeenCalledWith(null);

  act(() => root.unmount());
  expect(forwardedCleanup).toHaveBeenCalledTimes(2);
  expect(forwardedRef).not.toHaveBeenCalledWith(null);
  container.remove();
  vi.unstubAllGlobals();
});
