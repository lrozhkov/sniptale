// @vitest-environment jsdom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useReviewStageGeometry } from './stage-geometry';

let host: HTMLDivElement;
let root: Root;
let viewport: { width: number; height: number };
let resize: () => void;
let observed: ReturnType<typeof useReviewStageGeometry>;
const disconnect = vi.fn();
const source = { duration: 4, width: 1921, height: 1081, mimeType: 'video/webm', size: 5 };
const camera = { scale: 1, centerX: 0.5, centerY: 0.5 };

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  viewport = { width: 800, height: 450 };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect = disconnect;
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => viewport.width);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => viewport.height);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function Probe(props: Parameters<typeof useReviewStageGeometry>[0]) {
  const target = useRef<HTMLDivElement>(null);
  const geometry = useReviewStageGeometry(props, target);
  useEffect(() => {
    observed = geometry;
  }, [geometry]);
  return <div ref={target} />;
}
async function render(props: Parameters<typeof useReviewStageGeometry>[0]) {
  await act(async () => root.render(<Probe {...props} />));
}
it('keeps canonical even source output independent of viewport resizing', async () => {
  await render({ source });
  expect(observed.watermarkOutput).toEqual({ width: 1920, height: 1080 });
  expect(observed.size.width).toBeLessThanOrEqual(800);
  expect(observed.size.height).toBe(450);
  viewport = { width: 400, height: 225 };
  act(() => resize());
  expect(observed.size.width).toBeLessThanOrEqual(400);
  expect(observed.size.height).toBe(225);
  expect(observed.watermarkOutput).toEqual({ width: 1920, height: 1080 });
  await act(async () => root.render(null));
  expect(disconnect).toHaveBeenCalledOnce();
});
it('uses full scene canvas for watermark pixels while reporting fitted drawing geometry', async () => {
  const onGeometry = vi.fn();
  await render({
    source,
    scene: { background: { enabled: false }, camera, canvas: { width: 1001, height: 777 } },
    comments: { onGeometry },
  });
  expect(observed.watermarkOutput).toEqual({ width: 1000, height: 776 });
  expect(observed.size.height).toBe(450);
  expect(observed.size.width).toBeLessThan(800);
  expect(onGeometry).toHaveBeenLastCalledWith({
    output: observed.size,
    projection: undefined,
    videoTransform: observed.sceneLayout!.videoTransform,
  });
  viewport = { width: 300, height: 200 };
  act(() => resize());
  expect(observed.watermarkOutput).toEqual({ width: 1000, height: 776 });
  expect(onGeometry).toHaveBeenLastCalledWith({
    output: observed.size,
    projection: undefined,
    videoTransform: observed.sceneLayout!.videoTransform,
  });
  expect(observed.size.height).toBe(200);
});
