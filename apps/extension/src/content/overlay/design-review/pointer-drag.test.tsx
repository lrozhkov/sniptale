// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useDesignReviewPointerDrag } from './pointer-drag';

const move = vi.fn();

function DragHarness() {
  const drag = useDesignReviewPointerDrag({
    move,
    position: { x: 20, y: 30 },
    uiScale: 0.5,
  });
  return <button type="button" data-ui="drag" {...drag} />;
}

afterEach(() => {
  move.mockReset();
  document.body.replaceChildren();
});

it('projects pointer movement into zoom-independent UI coordinates', () => {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<DragHarness />));
  const handle = container.querySelector<HTMLButtonElement>('[data-ui="drag"]');
  if (!handle) throw new Error('Expected drag handle');
  Object.defineProperties(handle, {
    releasePointerCapture: { configurable: true, value: vi.fn() },
    setPointerCapture: { configurable: true, value: vi.fn() },
  });

  const dispatch = (type: string, clientX: number, clientY: number) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX, clientY });
    Object.defineProperty(event, 'pointerId', { value: 7 });
    handle.dispatchEvent(event);
  };
  act(() => {
    dispatch('pointerdown', 50, 60);
    dispatch('pointermove', 70, 75);
    dispatch('pointerup', 70, 75);
  });

  expect(move).toHaveBeenCalledWith({ x: 20, y: 30 }, 40, 30);
  act(() => root.unmount());
});
