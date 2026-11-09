// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeedbackPanelPosition } from './position';

const save = vi.fn();
const roots: ReturnType<typeof createRoot>[] = [];
function Harness({ x = 24, open = true }: { x?: number; open?: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  const {
    position,
    cancelPointerDrag: _cancel,
    ...handlers
  } = useFeedbackPanelPosition(ref, open, 0.5, {
    position: { x, y: 72 },
    setPosition: save,
  });
  return (
    <aside ref={ref} data-x={position.x} data-y={position.y}>
      <header {...handlers} />
    </aside>
  );
}
function setup() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<Harness />));
  const handle = container.querySelector('header');
  if (!handle) throw new Error('Missing handle');
  Object.defineProperties(handle, {
    setPointerCapture: { value: vi.fn() },
    releasePointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
  });
  const pointer = (type: string, x = 50, id = 7) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: 60 });
      Object.defineProperty(event, 'pointerId', { value: id });
      handle.dispatchEvent(event);
    });
  return { root, container, handle, pointer };
}
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  save.mockReset();
});
it('previews scaled movement locally and commits exactly once at pointer release', () => {
  const { container, pointer } = setup();
  pointer('pointerdown');
  pointer('pointermove', 70);
  pointer('pointermove', 80);
  expect(container.querySelector('aside')?.dataset['x']).toBe('84');
  expect(save).not.toHaveBeenCalled();
  pointer('pointerup', 80, 8);
  expect(save).not.toHaveBeenCalled();
  pointer('pointerup', 80);
  pointer('pointerup', 80);
  expect(save).toHaveBeenCalledExactlyOnceWith({ x: 84, y: 72 });
});
it('does not snap to incoming persisted position during drag; cancellation restores origin without saving', () => {
  const { root, container, handle, pointer } = setup();
  pointer('pointerdown');
  pointer('pointermove', 70);
  act(() => root.render(<Harness x={100} />));
  expect(container.querySelector('aside')?.dataset['x']).toBe('64');
  pointer('pointercancel');
  expect(container.querySelector('aside')?.dataset['x']).toBe('24');
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
  expect(save).not.toHaveBeenCalled();
  act(() => root.render(<Harness x={120} />));
  expect(container.querySelector('aside')?.dataset['x']).toBe('120');
});
it('clamps movement to the logical viewport and does not save an unchanged gesture', () => {
  const { container, pointer } = setup();
  pointer('pointerdown');
  pointer('pointerup');
  expect(save).not.toHaveBeenCalled();
  pointer('pointerdown');
  pointer('pointermove', -1000);
  pointer('pointerup');
  expect(container.querySelector('aside')?.dataset['x']).toBe('12');
  expect(save).toHaveBeenCalledExactlyOnceWith({ x: 12, y: 72 });
});
it('cancels an active drag when the panel closes', () => {
  const { root, container, pointer } = setup();
  pointer('pointerdown');
  pointer('pointermove', 100);
  act(() => root.render(<Harness open={false} />));
  pointer('pointerup');
  expect(container.querySelector('aside')?.dataset['x']).toBe('24');
  expect(save).not.toHaveBeenCalled();
});
