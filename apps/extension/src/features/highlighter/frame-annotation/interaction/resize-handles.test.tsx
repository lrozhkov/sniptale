// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { FRAME_ANNOTATION_Z_INDEX } from './z-index';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FrameAnnotationResizeHandleLayer } from './resize-handles';

describe('frame annotation resize handles', () => {
  it('centers handles on document geometry without compensating for the drawn stroke', () => {
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

    expect(html).toContain('left:5.5px');
    expect(html).toContain('top:15.5px');
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

      expect(html).toContain('left:5.5px');
      expect(html).toContain('top:15.5px');
      expect(html).toContain('width:9px');
      expect(html).toContain('height:9px');
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
      ['nw', 5.5, 15.5, 'nwse-resize'],
      ['n', 54, 17, 'ns-resize'],
      ['ne', 105.5, 15.5, 'nesw-resize'],
      ['e', 107, 54, 'ew-resize'],
      ['se', 105.5, 95.5, 'nwse-resize'],
      ['s', 54, 97, 'ns-resize'],
      ['sw', 5.5, 95.5, 'nesw-resize'],
      ['w', 7, 54, 'ew-resize'],
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

it('keeps annotation controls on document snap geometry independently of stroke width', () => {
  for (const strokeWidth of [0, 1, 8, 20]) {
    const html = renderToStaticMarkup(
      <FrameAnnotationResizeHandleLayer
        frameId="aligned"
        frameRect={{ x: 40, y: 60, width: 100, height: 80 }}
        handleSize={9}
        strokeWidth={strokeWidth}
        directions={['nw']}
        onResizeStart={vi.fn()}
      />
    );
    expect(html).toContain('left:35.5px');
    expect(html).toContain('top:55.5px');
  }
});
