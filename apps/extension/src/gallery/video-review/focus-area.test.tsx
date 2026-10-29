// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewFocusArea } from './focus-area';

it.each(['nw', 'ne', 'sw', 'se'])(
  'keeps a circular camera square while dragging %s to scene edges',
  (corner) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 200, 100)
    );
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const change = vi.fn();
    const preview = vi.fn();
    const pointer = (node: Element, type: string, x: number, y: number) =>
      act(() => {
        const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        node.dispatchEvent(event);
      });
    try {
      act(() =>
        root.render(
          <ReviewFocusArea
            area={{ x: 0.25, y: 0.25, width: 0.2, height: 0.4 }}
            output={{ width: 200, height: 100 }}
            video={{ x: 0, y: 0, width: 200, height: 100 }}
            aspectRatio={1}
            onChange={change}
            onPreview={preview}
          />
        )
      );
      const plane = host.querySelector<HTMLElement>('[data-ui="gallery.videoReview.focusArea"]')!;
      Object.assign(plane, {
        setPointerCapture: vi.fn(),
        hasPointerCapture: () => true,
        releasePointerCapture: vi.fn(),
      });
      pointer(host.querySelector(`[data-resize="${corner}"]`)!, 'pointerdown', 70, 45);
      const x = corner.endsWith('w') ? -200 : 400;
      const y = corner.startsWith('n') ? -200 : 200;
      preview.mockClear();
      const queuedBefore = frames.length;
      pointer(plane, 'pointermove', 80, 50);
      pointer(plane, 'pointermove', x, y);
      expect(preview).not.toHaveBeenCalled();
      expect(frames).toHaveLength(queuedBefore + 1);
      act(() => {
        for (const callback of [...frames]) callback(0);
      });
      expect(preview).toHaveBeenCalledTimes(1);
      pointer(plane, 'pointermove', 80, 50);
      pointer(plane, 'pointerup', x, y);
      const area = change.mock.lastCall![0];
      expect(area.width * 200).toBeCloseTo(area.height * 100);
      expect(area.x).toBeGreaterThanOrEqual(0);
      expect(area.y).toBeGreaterThanOrEqual(0);
      expect(area.x + area.width).toBeLessThanOrEqual(1);
      expect(area.y + area.height).toBeLessThanOrEqual(1);
      expect(corner.endsWith('w') ? area.x + area.width : area.x).toBeCloseTo(
        corner.endsWith('w') ? 0.45 : 0.25
      );
      expect(corner.startsWith('n') ? area.y + area.height : area.y).toBeCloseTo(
        corner.startsWith('n') ? 0.65 : 0.25
      );
      change.mockClear();
      pointer(host.querySelector(`[data-resize="${corner}"]`)!, 'pointerdown', 70, 45);
      pointer(plane, 'pointermove', 90, 55);
      const pending = frames.at(-1)!;
      if (corner === 'nw') {
        act(() =>
          host
            .querySelector('[role="group"]')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        );
      } else if (corner === 'ne') {
        pointer(plane, 'pointercancel', 90, 55);
      } else if (corner === 'sw') {
        pointer(plane, 'lostpointercapture', 90, 55);
      } else {
        act(() => window.dispatchEvent(new Event('blur')));
      }
      expect(change).not.toHaveBeenCalled();
      expect(preview).toHaveBeenLastCalledWith(null);
      preview.mockClear();
      act(() => pending(0));
      expect(preview).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  }
);

it('moves the Focus body and cancels a pending preview when disabled', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 100)
  );
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const preview = vi.fn();
  const change = vi.fn();
  const props = {
    area: { x: 0.25, y: 0.25, width: 0.2, height: 0.4 },
    output: { width: 200, height: 100 },
    video: { x: 0, y: 0, width: 200, height: 100 },
    onChange: change,
    onPreview: preview,
  };
  const pointer = (node: Element, type: string, x: number, id = 1) =>
    act(() => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 40, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: id });
      node.dispatchEvent(event);
    });
  try {
    act(() => root.render(<ReviewFocusArea {...props} />));
    const plane = host.firstElementChild!;
    Object.assign(plane, { setPointerCapture: vi.fn(), hasPointerCapture: () => false });
    const body = host.querySelector('[role="group"]')!;
    pointer(plane, 'pointermove', 50);
    pointer(body, 'pointerdown', 50);
    pointer(plane, 'pointerup', 50, 2);
    pointer(plane, 'pointermove', 70);
    act(() => {
      for (const callback of [...frames]) callback(0);
    });
    expect(preview).toHaveBeenLastCalledWith({ ...props.area, x: 0.35 });
    pointer(plane, 'pointerup', 90);
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...props.area, x: 0.45 });
    change.mockClear();
    pointer(body, 'pointerdown', 50);
    pointer(plane, 'pointerup', 50);
    expect(change).not.toHaveBeenCalled();
    pointer(body, 'pointerdown', 50);
    pointer(plane, 'pointermove', 70);
    const pending = frames.at(-1)!;
    act(() => root.render(<ReviewFocusArea {...props} disabled />));
    expect(preview).toHaveBeenLastCalledWith(null);
    preview.mockClear();
    act(() => pending(0));
    pointer(body, 'pointerdown', 50);
    expect(preview).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
