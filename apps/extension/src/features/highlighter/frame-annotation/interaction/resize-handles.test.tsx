// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FRAME_ANNOTATION_Z_INDEX } from './z-index';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FrameAnnotationResizeHandleLayer } from './resize-handles';

describe('frame annotation resize handles', () => {
  it('centers handles on the middle of an outward stroke', () => {
    const html = renderToStaticMarkup(
      <FrameAnnotationResizeHandleLayer
        directions={['nw']}
        frameId="frame-1"
        frameRect={{ x: 10, y: 20, width: 100, height: 80 }}
        handleSize={10}
        onResizeStart={vi.fn()}
        strokeWidth={4}
      />
    );

    expect(html).toContain('left:3px');
    expect(html).toContain('top:13px');
  });

  it.each([{ visualScale: 4 }, { visualScale: 0.5 }, { visualScale: 0.2 }])(
    'keeps handle centers anchored at visual scale $visualScale',
    (sample) => {
      const html = renderToStaticMarkup(
        <FrameAnnotationResizeHandleLayer
          directions={['nw']}
          frameId="frame-zoom"
          frameRect={{ x: 10, y: 20, width: 100, height: 80 }}
          handleSize={10}
          onResizeStart={vi.fn()}
          strokeWidth={4}
          visualScale={sample.visualScale}
        />
      );

      const strokeOutset = (4 * sample.visualScale) / 2;
      expect(html).toContain(`left:${10 - strokeOutset - 5}px`);
      expect(html).toContain(`top:${20 - strokeOutset - 5}px`);
    }
  );

  it('keeps all resize directions interactive above the frame and below the number', () => {
    const onResizeStart = vi.fn();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    act(() =>
      root.render(
        <FrameAnnotationResizeHandleLayer
          frameId="frame-1"
          frameRect={{ x: 10, y: 20, width: 100, height: 80 }}
          handleSize={10}
          position="absolute"
          borderColor="#ff6600"
          onResizeStart={onResizeStart}
        />
      )
    );
    const handles = [...container.querySelectorAll<HTMLElement>('.sniptale-resize-handle')];
    expect(handles).toHaveLength(8);
    const expected = [
      ['nw', 5, 15, 'nwse-resize'],
      ['n', 55, 15, 'ns-resize'],
      ['ne', 105, 15, 'nesw-resize'],
      ['e', 105, 55, 'ew-resize'],
      ['se', 105, 95, 'nwse-resize'],
      ['s', 55, 95, 'ns-resize'],
      ['sw', 5, 95, 'nesw-resize'],
      ['w', 5, 55, 'ew-resize'],
    ] as const;
    for (const [index, handle] of handles.entries()) {
      const [direction, left, top, cursor] = expected[index]!;
      expect(handle.dataset['direction']).toBe(direction);
      expect(handle.style.left).toBe(`${left}px`);
      expect(handle.style.top).toBe(`${top}px`);
      expect(handle.style.cursor).toBe(cursor);
      expect(handle.style.pointerEvents).toBe('auto');
      expect(Number(handle.style.zIndex)).toBeGreaterThan(FRAME_ANNOTATION_Z_INDEX.frameActive);
      expect(Number(handle.style.zIndex)).toBeLessThan(FRAME_ANNOTATION_Z_INDEX.stepBadge);
      act(() => handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
      expect(onResizeStart).toHaveBeenLastCalledWith(expect.anything(), direction);
    }
    act(() => root.unmount());
    vi.unstubAllGlobals();
  });
});
