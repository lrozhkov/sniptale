// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Gradient } from '@sniptale/foundation/paint';
import { GradientCanvas } from './gradient-canvas';

const base = {
  interpolation: 'srgb' as const,
  repeat: { enabled: false, span: 1 },
  stops: [
    { id: 'a', color: '#000000ff', midpoint: 0.5, position: 0 },
    { id: 'b', color: '#ffffffff', midpoint: 0.5, position: 1 },
  ],
};
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
});
function mount(initial: Gradient, shadow = false) {
  const host = document.createElement('div');
  const outer = document.createElement('div');
  document.body.append(outer);
  if (shadow) outer.attachShadow({ mode: 'open' }).append(host);
  else outer.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  function Harness() {
    const [gradient, setGradient] = useState(initial);
    return (
      <GradientCanvas
        gradient={gradient}
        onChange={(next) => {
          changed(next);
          setGradient(next);
        }}
      />
    );
  }
  act(() => root.render(<Harness />));
  cleanup.push(() => {
    act(() => root.unmount());
    outer.remove();
  });
  const canvas = host.querySelector<HTMLElement>('[data-ui$="canvas"]')!;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  const handle = (kind: string) => {
    const node = host.querySelector<HTMLButtonElement>(`[data-gradient-handle="${kind}"]`)!;
    let captured = false;
    node.setPointerCapture = () => {
      captured = true;
    };
    node.hasPointerCapture = () => captured;
    node.releasePointerCapture = () => {
      captured = false;
    };
    return node;
  };
  return { host, root, changed, handle };
}
function pointer(node: Element, type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  act(() => node.dispatchEvent(event));
}
function key(node: Element, name: string, shiftKey = false) {
  act(() =>
    node.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: name, shiftKey }))
  );
}
it('wraps linear directions and supports precise and accelerated keyboard geometry', () => {
  const test = mount({ ...base, type: 'linear', angle: 359 });
  const direction = test.handle('direction');
  key(direction, 'ArrowRight');
  expect(test.changed.mock.lastCall?.[0].angle).toBe(0);
  key(direction, 'ArrowLeft', true);
  expect(test.changed.mock.lastCall?.[0].angle).toBe(345);
  pointer(direction, 'pointerdown', 100, 10);
  pointer(direction, 'pointermove', 140, 50);
  expect(test.changed.mock.lastCall?.[0].angle).toBe(75);
  pointer(direction, 'pointerup', 140, 50);
});
it('hides the pointer only during a geometry drag and restores it on cancel, blur, Escape and unmount', () => {
  const test = mount({ ...base, type: 'conic', center: { x: 0.5, y: 0.5 }, startAngle: 0 });
  const center = test.handle('center');
  const cursorRules = () =>
    [...document.head.querySelectorAll('style')].filter(
      (style) => style.textContent === '*{cursor:none!important}'
    );
  for (const end of ['pointercancel', 'blur', 'Escape']) {
    pointer(center, 'pointerdown', 100, 50);
    expect(cursorRules()).toHaveLength(1);
    pointer(center, 'pointermove', 150, 75);
    expect(test.changed.mock.lastCall?.[0].center).toEqual({ x: 0.75, y: 0.75 });
    if (end === 'Escape') key(center, 'Escape');
    else if (end === 'blur') act(() => window.dispatchEvent(new Event('blur')));
    else pointer(center, end, 150, 75);
    expect(cursorRules()).toHaveLength(0);
  }
  pointer(center, 'pointerdown', 150, 75);
  cleanup.splice(0).forEach((fn) => fn());
  expect(cursorRules()).toHaveLength(0);
});
it('adjusts clamped radii without jumps and moves the center with keyboard', () => {
  const test = mount({
    ...base,
    type: 'radial',
    center: { x: 0.9, y: 0.5 },
    radius: { x: 0.9, y: 0.5 },
  });
  const radius = test.handle('radius-x');
  pointer(radius, 'pointerdown', 10, 50);
  pointer(radius, 'pointermove', 30, 50);
  expect(test.changed.mock.lastCall?.[0].radius.x).toBe(0.8);
  pointer(radius, 'pointerup', 30, 50);
  key(radius, 'ArrowDown', true);
  expect(test.changed.mock.lastCall?.[0].radius.x).toBeCloseTo(0.65);
  const center = test.handle('center');
  key(center, 'ArrowUp', true);
  expect(test.changed.mock.lastCall?.[0].center.y).toBe(0.4);
});

it('hides the captured cursor inside a content ShadowRoot and ignores another pointer release', () => {
  const test = mount({ ...base, type: 'linear', angle: 0 }, true);
  const direction = test.handle('direction');
  pointer(direction, 'pointerdown', 100, 10);
  const shadow = test.host.getRootNode();
  expect(shadow instanceof ShadowRoot).toBe(true);
  expect((shadow as ShadowRoot).querySelector('style')?.textContent).toContain('cursor:none');
  const unrelated = new MouseEvent('pointerup', { bubbles: true });
  Object.defineProperty(unrelated, 'pointerId', { value: 2 });
  act(() => document.dispatchEvent(unrelated));
  expect((shadow as ShadowRoot).querySelector('style')).not.toBeNull();
  pointer(direction, 'lostpointercapture', 100, 10);
  expect((shadow as ShadowRoot).querySelector('style')).toBeNull();
});

it('restores the cursor when the gradient type changes during a captured direction drag', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  cleanup.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  act(() =>
    root.render(
      <GradientCanvas gradient={{ ...base, type: 'linear', angle: 0 }} onChange={vi.fn()} />
    )
  );
  const canvas = host.querySelector<HTMLElement>('[data-ui$="canvas"]')!;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 }) as DOMRect;
  const direction = host.querySelector<HTMLButtonElement>('[data-gradient-handle="direction"]')!;
  let captured = false;
  direction.setPointerCapture = () => {
    captured = true;
  };
  direction.hasPointerCapture = () => captured;
  direction.releasePointerCapture = () => {
    captured = false;
  };
  pointer(direction, 'pointerdown', 100, 10);
  expect(captured).toBe(true);
  const cursorRules = () =>
    [...document.head.querySelectorAll('style')].filter(
      (style) => style.textContent === '*{cursor:none!important}'
    );
  expect(cursorRules()).toHaveLength(1);
  act(() =>
    root.render(
      <GradientCanvas
        gradient={{ ...base, type: 'conic', center: { x: 0.5, y: 0.5 }, startAngle: 0 }}
        onChange={vi.fn()}
      />
    )
  );
  expect(cursorRules()).toHaveLength(0);
  expect(captured).toBe(false);
});
