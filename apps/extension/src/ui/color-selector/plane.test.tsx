// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ColorPlane } from './plane';

vi.mock('../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function dispatchPointerEvent(
  element: HTMLDivElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup',
  init: { clientX?: number; clientY?: number; pointerId: number }
) {
  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerId: { value: init.pointerId },
  });
  element.dispatchEvent(event);
}

function getPlaneElement() {
  const plane = container?.querySelector('[role="slider"]');
  if (!(plane instanceof HTMLDivElement)) {
    throw new Error('Plane element not found');
  }

  return plane;
}

function renderPlane(props: Partial<React.ComponentProps<typeof ColorPlane>> = {}) {
  if (!container) {
    throw new Error('missing container');
  }

  const planeRef = { current: null as HTMLDivElement | null };
  const onSelectionChange = props.onSelectionChange ?? vi.fn();

  act(() => {
    root?.render(
      <ColorPlane
        getColorFromPlanePoint={({ left, top }) => `#${left}-${top}`}
        hue={120}
        onSelectionChange={onSelectionChange}
        planeColor="#123456"
        planeRef={planeRef}
        saturation={0.5}
        value={0.6}
        {...props}
      />
    );
  });

  const plane = getPlaneElement();
  const setPointerCapture = vi.fn();
  const releasePointerCapture = vi.fn();
  const hasPointerCapture = vi.fn(() => true);

  Object.defineProperties(plane, {
    getBoundingClientRect: {
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    },
    hasPointerCapture: { value: hasPointerCapture },
    releasePointerCapture: { value: releasePointerCapture },
    setPointerCapture: { value: setPointerCapture },
  });

  return {
    hasPointerCapture,
    onSelectionChange,
    plane,
    planeRef,
    releasePointerCapture,
    setPointerCapture,
  };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('captures pointer drag, updates on plane moves, and releases on pointer up', async () => {
  const onSelectionChange = vi.fn();
  const { plane, setPointerCapture, releasePointerCapture } = renderPlane({ onSelectionChange });

  await act(async () => {
    dispatchPointerEvent(plane, 'pointerdown', { clientX: 20, clientY: 30, pointerId: 7 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 40, clientY: 50, pointerId: 7 });
    dispatchPointerEvent(plane, 'pointerup', { pointerId: 7 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 60, clientY: 70, pointerId: 7 });
  });

  expect(setPointerCapture).toHaveBeenCalledWith(7);
  expect(releasePointerCapture).toHaveBeenCalledWith(7);
  expect(onSelectionChange).toHaveBeenCalledTimes(2);
  expect(onSelectionChange).toHaveBeenNthCalledWith(1, { saturation: 0.2, value: 0.7 });
  expect(onSelectionChange).toHaveBeenNthCalledWith(2, { saturation: 0.4, value: 0.5 });
});

it('ignores move events from a different pointer and clears on pointer cancel', async () => {
  const onSelectionChange = vi.fn();
  const { plane, releasePointerCapture } = renderPlane({ onSelectionChange });

  await act(async () => {
    dispatchPointerEvent(plane, 'pointerdown', { clientX: 20, clientY: 20, pointerId: 5 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 30, clientY: 30, pointerId: 9 });
    dispatchPointerEvent(plane, 'pointercancel', { pointerId: 5 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 40, clientY: 40, pointerId: 5 });
  });

  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  expect(releasePointerCapture).toHaveBeenCalledWith(5);
});

it('clears the active pointer on lost pointer capture and skips release when capture is absent', async () => {
  const onSelectionChange = vi.fn();
  const { hasPointerCapture, plane, releasePointerCapture } = renderPlane({ onSelectionChange });
  hasPointerCapture.mockReturnValue(false);

  await act(async () => {
    dispatchPointerEvent(plane, 'pointerdown', { clientX: 20, clientY: 20, pointerId: 13 });
    plane.dispatchEvent(new Event('lostpointercapture', { bubbles: true }));
    dispatchPointerEvent(plane, 'pointermove', { clientX: 30, clientY: 30, pointerId: 13 });
    dispatchPointerEvent(plane, 'pointerup', { pointerId: 13 });
  });

  expect(onSelectionChange).toHaveBeenCalledTimes(1);
  expect(releasePointerCapture).not.toHaveBeenCalled();
});

it('keeps corner drags clamped and monotonic near dark corners for the active pointer', async () => {
  const onSelectionChange = vi.fn();
  const { plane } = renderPlane({ onSelectionChange });

  await act(async () => {
    dispatchPointerEvent(plane, 'pointerdown', { clientX: 99, clientY: 99, pointerId: 11 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 100, clientY: 100, pointerId: 11 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: 120, clientY: 130, pointerId: 11 });
    dispatchPointerEvent(plane, 'pointermove', { clientX: -10, clientY: 130, pointerId: 11 });
  });

  const [firstCall, secondCall, thirdCall, fourthCall] = onSelectionChange.mock.calls.map(
    ([selection]) => selection as { saturation: number; value: number }
  );

  expect(firstCall?.saturation).toBeCloseTo(0.99);
  expect(firstCall?.value).toBeCloseTo(0.01);
  expect(secondCall).toEqual({ saturation: 1, value: 0 });
  expect(thirdCall).toEqual({ saturation: 1, value: 0 });
  expect(fourthCall).toEqual({ saturation: 0, value: 0 });
});

it('renders a non-interactive marker and touch-safe plane surface', () => {
  const { plane, planeRef } = renderPlane();

  expect(plane.className).toContain('touch-none');
  expect(planeRef.current).toBe(plane);
  expect(plane.querySelector('.pointer-events-none')).not.toBeNull();
});
