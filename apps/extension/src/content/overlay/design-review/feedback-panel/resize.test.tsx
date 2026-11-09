// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useFeedbackPanelResize } from './resize';

const roots: ReturnType<typeof createRoot>[] = [];
function Harness({ open = true, scale = 1 }: { open?: boolean; scale?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const { height, ariaHeight, minHeight, maxHeight, resized, ...handlers } = useFeedbackPanelResize(
    ref,
    open,
    scale
  );
  return (
    <aside
      ref={ref}
      data-resized={String(resized)}
      data-height={height}
      data-aria-height={ariaHeight}
      data-min={minHeight}
      data-max={maxHeight}
    >
      <div role="separator" {...handlers} />
    </aside>
  );
}
function setup(scale = 1) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<Harness scale={scale} />));
  const handle = container.querySelector('[role="separator"]');
  const panel = container.querySelector('aside');
  if (!(handle instanceof HTMLElement) || !panel) throw new Error('Missing resize controls');
  Object.defineProperties(handle, {
    setPointerCapture: { value: vi.fn() },
    releasePointerCapture: { value: vi.fn() },
    hasPointerCapture: { value: () => true },
  });
  const pointer = (type: string, y = 100, id = 7) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 0, clientY: y });
      Object.defineProperty(event, 'pointerId', { value: id });
      handle.dispatchEvent(event);
    });
  const key = (key: string) =>
    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  return { root, panel, handle, pointer, key };
}
afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('resizes from the bottom in scaled coordinates and releases capture', () => {
  const { panel, handle, pointer } = setup(0.5);
  expect(panel.dataset['height']).toBe('420');
  pointer('pointerdown');
  pointer('pointermove', 130, 8);
  expect(panel.dataset['height']).toBe('420');
  pointer('pointermove', 130);
  expect(panel.dataset['height']).toBe('480');
  pointer('pointerup', 130);
  expect(handle.releasePointerCapture).toHaveBeenCalledWith(7);
  pointer('pointermove', 200);
  expect(panel.dataset['height']).toBe('480');
});
it('uses 16px keyboard steps and clamps Home/End to measured available viewport', () => {
  const { panel, key } = setup();
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 72, 408, 420));
  key('ArrowUp');
  expect(panel.dataset['height']).toBe('404');
  key('ArrowDown');
  expect(panel.dataset['height']).toBe('420');
  key('Home');
  expect(panel.dataset['height']).toBe('180');
  key('End');
  expect(Number(panel.dataset['height'])).toBe(window.innerHeight - 72 - 12);
  key('ArrowDown');
  expect(panel.dataset['height']).toBe(panel.dataset['max']);
});
it('restores height on pointer cancellation and ignores later moves', () => {
  const { panel, pointer } = setup();
  pointer('pointerdown');
  pointer('pointermove', 150);
  expect(panel.dataset['height']).toBe('470');
  pointer('pointercancel');
  pointer('pointermove', 200);
  expect(panel.dataset['height']).toBe('420');
});
it('caps the minimum on short viewports and reclamps after resize and reopening', () => {
  const { root, panel, key } = setup();
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 72, 408, 420));
  vi.stubGlobal('innerHeight', 200);
  act(() => window.dispatchEvent(new Event('resize')));
  expect(panel.dataset['height']).toBe('116');
  expect(panel.dataset['min']).toBe('116');
  key('Home');
  expect(panel.dataset['height']).toBe('116');
  act(() => root.render(<Harness open={false} />));
  vi.stubGlobal('innerHeight', 160);
  act(() => root.render(<Harness />));
  expect(panel.dataset['height']).toBe('76');
});

it('restores height when capture is lost and cancels the gesture on close', () => {
  const { root, panel, pointer } = setup();
  pointer('pointerdown');
  pointer('pointermove', 150);
  pointer('lostpointercapture');
  expect(panel.dataset['height']).toBe('420');
  pointer('pointerdown');
  pointer('pointermove', 160);
  act(() => root.render(<Harness open={false} />));
  pointer('pointerup', 160);
  expect(panel.dataset['height']).toBe('420');
});

it('starts resizing at the actual short-list height and returns to automatic size on cancel', () => {
  const { panel, pointer, key } = setup();
  Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 200 });
  expect(panel.dataset['resized']).toBe('false');
  pointer('pointerdown');
  pointer('pointermove', 130);
  expect(panel.dataset['height']).toBe('230');
  expect(panel.dataset['resized']).toBe('true');
  pointer('pointercancel');
  expect(panel.dataset['resized']).toBe('false');
  key('ArrowDown');
  expect(panel.dataset['height']).toBe('216');
  expect(panel.dataset['resized']).toBe('true');
});

it('reports measured automatic height for the separator value', () => {
  const { root, panel } = setup();
  Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 200 });
  act(() => root.render(<Harness />));
  act(() => window.dispatchEvent(new Event('resize')));
  expect(panel.dataset['resized']).toBe('false');
  expect(panel.dataset['ariaHeight']).toBe('200');
});

it('recomputes the height budget when dragging changes the panel top', async () => {
  const { panel } = setup();
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 500, 408, 200));
  await act(async () => {
    panel.style.top = '500px';
  });
  expect(Number(panel.dataset['max'])).toBe(window.innerHeight - 500 - 12);
  expect(Number(panel.dataset['height'])).toBe(window.innerHeight - 500 - 12);
});
