// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useAnnotationMarkerDrag } from './drag';

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init);
    this.pointerId = init.pointerId;
  }
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('keeps marker drag projection in the compensated UI coordinate space', () => {
  vi.stubGlobal('innerWidth', 800);
  vi.stubGlobal('innerHeight', 600);
  const target = document.createElement('div');
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 200, 120));
  const onChange = vi.fn();
  const host = document.createElement('div');
  document.body.append(host, target);
  const root = createRoot(host);

  function Harness() {
    const drag = useAnnotationMarkerDrag({
      offset: { x: 0, y: 0 },
      onChange,
      target,
      uiScale: 0.2,
    });
    return <button {...drag}>marker</button>;
  }

  act(() => root.render(<Harness />));
  const button = host.querySelector('button')!;
  Object.defineProperty(button, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(button, 'releasePointerCapture', { value: vi.fn() });
  act(() => {
    button.dispatchEvent(
      new TestPointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 120,
        clientY: 100,
        pointerId: 7,
      })
    );
    button.dispatchEvent(
      new TestPointerEvent('pointermove', {
        bubbles: true,
        clientX: 130,
        clientY: 110,
        pointerId: 7,
      })
    );
  });

  expect(onChange).toHaveBeenCalledWith({ x: 5.6000000000000005, y: 10 });
  act(() => root.unmount());
});
