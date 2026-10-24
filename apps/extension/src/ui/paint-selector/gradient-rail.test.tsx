// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { Gradient } from '@sniptale/foundation/paint';
import { GradientRail } from './gradient-rail';

const gradient: Gradient = {
  angle: 90,
  interpolation: 'srgb',
  repeat: { enabled: false, span: 1 },
  stops: [
    { id: 'first', color: '#000000ff', midpoint: 0.5, position: 0 },
    { id: 'second', color: '#ffffffff', midpoint: 0.5, position: 1 },
  ],
  type: 'linear',
};

function pointerDown(element: HTMLElement, clientX: number) {
  const event = new MouseEvent('pointerdown', { bubbles: true, clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  element.dispatchEvent(event);
}

function pointerMove(element: HTMLElement, clientX: number) {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  element.dispatchEvent(event);
}

it('selects an inactive stop on first pointer down without changing its position', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  const onSelect = vi.fn();
  document.body.append(host);
  act(() =>
    root.render(
      <GradientRail
        createId={() => 'new'}
        gradient={gradient}
        selectedStopId="first"
        onChange={onChange}
        onSelect={onSelect}
      />
    )
  );
  const rail = host.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.rail"] > div')!;
  expect(rail.className).toContain('cursor-crosshair');
  rail.getBoundingClientRect = () =>
    ({ left: 0, right: 200, top: 0, bottom: 56, width: 200, height: 56 }) as DOMRect;
  const second = host.querySelector<HTMLButtonElement>('[aria-label$="100%"]')!;
  second.setPointerCapture = vi.fn();
  second.hasPointerCapture = vi.fn(() => true);
  second.releasePointerCapture = vi.fn();

  act(() => pointerDown(second, 100));

  expect(onSelect).toHaveBeenCalledWith('second');
  expect(onChange).not.toHaveBeenCalled();
  act(() => root.unmount());
  host.remove();
});

it('does not move an already selected stop until the pointer actually moves', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  document.body.append(host);
  act(() =>
    root.render(
      <GradientRail
        createId={() => 'new'}
        gradient={gradient}
        selectedStopId="second"
        onChange={onChange}
        onSelect={vi.fn()}
      />
    )
  );
  const rail = host.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.rail"] > div')!;
  rail.getBoundingClientRect = () =>
    ({ left: 0, right: 200, top: 0, bottom: 56, width: 200, height: 56 }) as DOMRect;
  const second = host.querySelector<HTMLButtonElement>('[aria-label$="100%"]')!;
  second.setPointerCapture = vi.fn();
  second.hasPointerCapture = vi.fn(() => true);
  second.releasePointerCapture = vi.fn();

  act(() => pointerDown(second, 100));
  expect(onChange).not.toHaveBeenCalled();

  act(() => pointerMove(second, 101));
  expect(onChange).not.toHaveBeenCalled();

  act(() => pointerMove(second, 100));
  expect(onChange).not.toHaveBeenCalled();

  act(() => pointerMove(second, 120));
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      stops: expect.arrayContaining([expect.objectContaining({ id: 'second', position: 0.6 })]),
    })
  );
  act(() => root.unmount());
  host.remove();
});

it('edits midpoint with arrow keys while a cancelled stop drag preserves all stops', () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  const onChange = vi.fn();
  document.body.append(host);
  act(() =>
    root.render(
      <GradientRail
        createId={() => 'new'}
        gradient={gradient}
        selectedStopId="second"
        onChange={onChange}
        onSelect={vi.fn()}
      />
    )
  );
  const midpoint = host.querySelector<HTMLButtonElement>('button')!;
  act(() =>
    midpoint.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', shiftKey: true })
    )
  );
  expect(onChange.mock.lastCall?.[0].stops[0].midpoint).toBe(0.6);
  const rail = host.querySelector<HTMLElement>('[data-ui="shared.ui.paint-selector.rail"] > div')!;
  rail.getBoundingClientRect = () => ({ left: 0, top: 0, bottom: 12, width: 200 }) as DOMRect;
  const stop = host.querySelector<HTMLButtonElement>('[aria-label$="100%"]')!;
  stop.setPointerCapture = vi.fn();
  stop.hasPointerCapture = vi.fn(() => true);
  stop.releasePointerCapture = vi.fn();
  act(() => pointerDown(stop, 200));
  onChange.mockClear();
  const cancelled = new MouseEvent('pointercancel', { bubbles: true, clientX: 200, clientY: 500 });
  Object.defineProperty(cancelled, 'pointerId', { value: 1 });
  act(() => stop.dispatchEvent(cancelled));
  expect(onChange).not.toHaveBeenCalled();
  expect(stop.releasePointerCapture).toHaveBeenCalledWith(1);
  act(() => root.unmount());
  host.remove();
});
