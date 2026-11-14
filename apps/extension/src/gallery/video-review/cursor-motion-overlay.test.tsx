// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ReviewCursorMotionOverlay } from './cursor-motion-overlay';
import { cursorMotionSegment, type CursorMotion } from '../../features/video/project/cursor-motion';
import type { CursorFocusPath } from '../../features/video/project/cursor-focus-path/types';

it('commits projected point dragging once, clamps edges and discards cancelled gestures', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const motion: CursorMotion = {
    id: 'm',
    start: 1,
    end: 3,
    enabled: true,
    shape: 'arrow',
    size: 48,
    color: '#000000',
    outline: '#ffffff',
    shadow: false,
    easing: 'linear',
    points: [
      { id: 'a', at: 0, x: 0.2, y: 0.3 },
      { id: 'b', at: 1, x: 0.7, y: 0.8 },
    ],
  };
  const path: CursorFocusPath = {
    version: 1,
    mode: 'follow',
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold',
    segments: [cursorMotionSegment(motion)],
  };
  const change = vi.fn(),
    select = vi.fn();
  const render = (value = path, projected = false) =>
    act(() =>
      root.render(
        <ReviewCursorMotionOverlay
          path={value}
          onChange={change}
          onSelect={select}
          selectedKeyId="a"
          output={{ width: 100, height: 100 }}
          video={{ x: 10, y: 10, width: 80, height: 80 }}
          {...(projected ? { projection: [1, 0, 0, 0, 1, 0, 0, 0, 1] as const } : {})}
        />
      )
    );
  const pointer = (node: Element, name: string, x = 50, button = 0, id = 1) =>
    act(() => {
      const e = new MouseEvent(name, { bubbles: true, clientX: x, clientY: x, button });
      Object.defineProperty(e, 'pointerId', { value: id });
      node.dispatchEvent(e);
    });
  try {
    render();
    const svg = host.querySelector('svg')!;
    Object.assign(svg, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: () => true,
      releasePointerCapture: vi.fn(),
      getBoundingClientRect: () => new DOMRect(0, 0, 100, 100),
    });
    const point = host.querySelector('circle')!;
    pointer(svg, 'pointermove');
    pointer(svg, 'pointerup');
    pointer(point, 'pointerdown', 20, 2);
    pointer(svg, 'pointermove');
    expect(change).not.toHaveBeenCalled();
    pointer(point, 'pointerdown');
    pointer(svg, 'pointermove', 300, 0, 2);
    pointer(svg, 'pointermove', 300);
    pointer(svg, 'pointerup');
    expect(change).toHaveBeenCalledOnce();
    expect(change.mock.calls[0]![0].segments[0].keys[0]).toMatchObject({ x: 1, y: 1 });
    expect(path.segments[0]!.keys[0]).toMatchObject({ x: 0.2, y: 0.3 });
    for (const reason of ['Escape', 'blur', 'pointercancel']) {
      pointer(point, 'pointerdown');
      pointer(svg, 'pointermove', 60);
      act(() => {
        if (reason === 'Escape')
          window.dispatchEvent(new KeyboardEvent('keydown', { key: reason }));
        else if (reason === 'blur') window.dispatchEvent(new Event('blur'));
        else svg.dispatchEvent(new Event('pointercancel', { bubbles: true }));
      });
      pointer(svg, 'pointerup');
    }
    expect(change).toHaveBeenCalledOnce();
    render(path, true);
    pointer(point, 'pointerdown');
    pointer(svg, 'pointermove', -100);
    pointer(svg, 'pointerup');
    expect(change.mock.calls.at(-1)![0].segments[0].keys[0]).toMatchObject({ x: 0, y: 0 });
    act(() => point.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
    expect(select).toHaveBeenCalledWith('a', 1);
    pointer(point, 'pointerdown');
    pointer(svg, 'pointerup');
    expect(change).toHaveBeenCalledTimes(2);
    render({ ...path, segments: [] });
    expect(host.querySelector('svg')).toBeNull();
  } finally {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
