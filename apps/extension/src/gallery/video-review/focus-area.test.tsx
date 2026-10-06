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
      pointer(plane, 'pointermove', x, y);
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
    } finally {
      act(() => root.unmount());
      host.remove();
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    }
  }
);
