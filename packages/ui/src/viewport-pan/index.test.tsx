// @vitest-environment jsdom
import { act, useRef, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useViewportPanGesture } from './index';
it('admits one primary pointer, keeps capture order and ignores foreign move/end events', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let gesture!: ReturnType<typeof useViewportPanGesture<HTMLDivElement>>;
  function Viewport() {
    const ref = useRef<HTMLDivElement>(null);
    gesture = useViewportPanGesture(ref);
    return <div ref={ref} />;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Viewport />));
    const node = host.firstElementChild as HTMLDivElement;
    const order: string[] = [];
    let captured: number | null = null;
    node.setPointerCapture = (id) => {
      order.push('capture');
      captured = id;
    };
    node.hasPointerCapture = (id) => captured === id;
    node.releasePointerCapture = vi.fn(() => {
      captured = null;
    });
    node.scrollLeft = 30;
    node.scrollTop = 40;
    const event = (id: number, x: number, y: number, button = 0) =>
      ({
        pointerId: id,
        clientX: x,
        clientY: y,
        button,
        currentTarget: node,
        preventDefault: vi.fn(),
      }) as unknown as PointerEvent<HTMLDivElement>;
    await act(async () => gesture.start(event(1, 100, 100, 2)));
    expect(gesture.dragging).toBe(false);
    await act(async () => gesture.start(event(1, 100, 100), () => order.push('caller')));
    expect(order).toEqual(['caller', 'capture']);
    expect(gesture.dragging).toBe(true);
    await act(async () => {
      gesture.start(event(2, 200, 200));
      gesture.move(event(2, 10, 10));
      gesture.end(event(2, 10, 10));
    });
    expect(node.scrollLeft).toBe(30);
    expect(captured).toBe(1);
    await act(async () => gesture.move(event(1, 80, 70)));
    expect([node.scrollLeft, node.scrollTop]).toEqual([50, 70]);
    await act(async () => gesture.end(event(1, 80, 70)));
    expect(gesture.dragging).toBe(false);
    expect(node.releasePointerCapture).toHaveBeenCalledOnce();
    await act(async () => gesture.finish());
    expect(node.releasePointerCapture).toHaveBeenCalledOnce();
    await act(async () => gesture.start(event(3, 20, 20)));
    captured = null;
    await act(async () => gesture.finish());
    expect(gesture.dragging).toBe(false);
    expect(node.releasePointerCapture).toHaveBeenCalledOnce();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
