// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Canvas, Point, type Transform } from 'fabric';
import { createFrameAnnotationProxy } from './proxy';
import { useFrameAnnotationCanvasUpdates } from './projection-space';
import { createTypedTestFixture } from '../testing/fabric-canvas.test-support';

it('coalesces native transform updates and releases pending work on unmount', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++next, callback);
    return next;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const canvas = new Canvas(document.createElement('canvas'), { renderOnAddRemove: false });
  const proxy = createFrameAnnotationProxy({
    frame: { id: 'number', annotationKind: 'step-badge', x: 20, y: 20, width: 1, height: 1 },
    ordering: 0,
    label: 'Number',
  });
  proxy.selectable = true;
  canvas.add(proxy);
  canvas.setActiveObject(proxy);
  frames.clear();
  const refresh = vi.fn();
  const Probe = () => {
    useFrameAnnotationCanvasUpdates(canvas, refresh);
    return null;
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<Probe />));
  const moving = () =>
    canvas.fire('object:moving', {
      target: proxy,
      pointer: new Point(20, 20),
      e: new MouseEvent('mousemove'),
      transform: createTypedTestFixture<Transform>({ target: proxy }),
    });
  for (let index = 0; index < 100; index += 1) moving();
  expect(frames.size).toBe(1);
  const callback = [...frames.values()][0]!;
  frames.clear();
  act(() => callback(0));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(frames.size).toBe(0);
  moving();
  act(() => root.unmount());
  expect(frames.size).toBe(0);
  moving();
  expect(frames.size).toBe(0);
  host.remove();
  await canvas.dispose();
  vi.unstubAllGlobals();
});
