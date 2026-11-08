import { ReviewPreviewRendererContext } from './use-preview-preferences';
// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ZoomPreviewCanvas } from './zoom-preview-canvas';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';

it('retains the Area raster while moving its focus and redraws changed raster inputs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const computedStyle = vi.spyOn(globalThis, 'getComputedStyle');
  const drawImage = vi.fn();
  const context = {
    drawImage,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    rect: vi.fn(),
  };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const host = document.createElement('div');
  const root = createRoot(host);
  const output = { width: 480, height: 270 };
  let props: ComponentProps<typeof ZoomPreviewCanvas> = {
    background: { enabled: false },
    imageUrl: null,
    camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
    frame: { image: document.createElement('canvas'), ...output },
    output,
    view: 'area',
    cornerRadius: 0,
    layout: computeQuickEditSceneLayout({
      output,
      source: output,
      background: { enabled: false },
      camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
    }),
    onCenter: vi.fn(),
  };
  const render = async () => {
    await act(async () => root.render(<ZoomPreviewCanvas {...props} />));
  };
  try {
    await render();
    expect(drawImage).toHaveBeenCalledOnce();
    expect(computedStyle).not.toHaveBeenCalled();
    const before = host.querySelector('.review-focus-frame')?.getAttribute('style');
    props = { ...props, camera: { ...props.camera, centerX: 0.7 } };
    await render();
    expect(host.querySelector('.review-focus-frame')?.getAttribute('style')).not.toBe(before);
    expect(drawImage).toHaveBeenCalledOnce();
    props = { ...props, frame: { image: document.createElement('canvas'), ...output } };
    await render();
    expect(drawImage).toHaveBeenCalledTimes(2);
    props = { ...props, cornerRadius: 4 };
    await render();
    expect(drawImage).toHaveBeenCalledTimes(3);
    props = { ...props, view: 'result' };
    await render();
    props = {
      ...props,
      camera: { ...props.camera },
      layout: { ...props.layout },
      onCenter: vi.fn(),
    };
    await render();
    expect(drawImage).toHaveBeenCalledTimes(4);

    props = { ...props, camera: { ...props.camera, centerX: 0.4 } };
    await render();
    expect(drawImage).toHaveBeenCalledTimes(5);
    props = {
      ...props,
      view: 'area',
      layout: { ...props.layout, videoRect: { ...props.layout.videoRect, x: 4 } },
    };
    await render();
    expect(drawImage).toHaveBeenCalledTimes(6);
    props = {
      ...props,
      background: {
        enabled: true,
        type: 'solid',
        color: '#ff0000',
        zoomBehavior: 'fixed',
        layout: { padding: 0, cornerRadius: 0 },
      },
    };
    await render();
    expect(drawImage).toHaveBeenCalledTimes(7);
    let tick: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      tick = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    props = { ...props, live: true };
    await render();
    const count = drawImage.mock.calls.length;
    await act(async () => tick?.(16));
    expect(drawImage.mock.calls.length).toBeGreaterThan(count);
    props = { ...props, live: false, headerImage: document.createElement('canvas') };
    await render();
    expect(drawImage).toHaveBeenCalledWith(
      props.headerImage,
      0,
      0,
      expect.any(Number),
      expect.any(Number)
    );
    const firstHeader = props.headerImage;
    props = { ...props, headerImage: document.createElement('canvas') };
    await render();
    expect(props.headerImage).not.toBe(firstHeader);
    expect(drawImage).toHaveBeenCalledWith(
      props.headerImage,
      0,
      0,
      expect.any(Number),
      expect.any(Number)
    );
  } finally {
    await act(async () => root.unmount());
    getContext.mockRestore();
    computedStyle.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('restores paused Result pixels after overlays and live playback without retaining an old frame', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Path2D', class {});
  const drawImage = vi.fn();
  const fillRect = vi.fn();
  const context = {
    drawImage,
    fillRect,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
    rect: vi.fn(),
  };
  const getContext = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const root = createRoot(document.createElement('div'));
  const output = { width: 480, height: 270 };
  const frame = { image: document.createElement('canvas'), ...output };
  let props: ComponentProps<typeof ZoomPreviewCanvas> = {
    background: { enabled: false },
    imageUrl: null,
    frame,
    output,
    view: 'result',
    cornerRadius: 0,
    camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
    layout: computeQuickEditSceneLayout({
      output,
      source: output,
      background: { enabled: false },
      camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
    }),
    onCenter: vi.fn(),
  };
  const render = () => act(async () => root.render(<ZoomPreviewCanvas {...props} />));
  const sourcePaints = () => drawImage.mock.calls.filter(([image]) => image === frame.image).length;
  let tick: FrameRequestCallback | undefined;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    tick = callback;
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
  try {
    await render();
    expect(sourcePaints()).toBe(1);
    const overlay = {
      opening: { x: 20, y: 20, width: 40, height: 40 },
      radius: 0,
      dim: 0.5,
      blur: 0,
      lens: { scale: 2, optics: 'flat' as const },
    };
    props = { ...props, lensFrames: [overlay] };
    await render();
    expect(sourcePaints()).toBe(2);
    expect(fillRect).toHaveBeenCalledOnce();
    props = { ...props, lensFrames: [{ ...overlay, dim: 0.7 }] };
    await render();
    expect(sourcePaints()).toBe(2);
    expect(fillRect).toHaveBeenCalledTimes(2);
    props = { ...props, lensFrames: [] };
    await render();
    expect(sourcePaints()).toBe(3);
    expect(fillRect).toHaveBeenCalledTimes(2);
    await render();
    expect(sourcePaints()).toBe(3);
    props = { ...props, live: true };
    await render();
    expect(sourcePaints()).toBe(4);
    await act(async () => tick?.(16));
    expect(sourcePaints()).toBe(5);
    props = { ...props, live: false };
    await render();
    expect(sourcePaints()).toBe(6);
    expect(cancel).toHaveBeenCalledWith(1);
    await render();
    expect(sourcePaints()).toBe(6);
    const nextFrame = { image: document.createElement('canvas'), ...output };
    props = { ...props, frame: nextFrame };
    await render();
    expect(drawImage).toHaveBeenLastCalledWith(
      nextFrame.image,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
    const count = drawImage.mock.calls.length;
    props = { ...props, output: { width: 320, height: 180 } };
    await render();
    expect(drawImage.mock.calls.length).toBe(count + 1);
  } finally {
    await act(async () => root.unmount());
    getContext.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('paints live HTML through owned RGB when VideoFrame is absent', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('VideoFrame', undefined);
  const rgbContext = document.createElement('canvas').getContext('2d')!;
  vi.spyOn(rgbContext, 'drawImage').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(rgbContext);
  const host = document.createElement('div');
  const root = createRoot(host);
  const output = { width: 80, height: 40 };
  const video = document.createElement('video');
  Object.defineProperty(video, 'readyState', { value: 2 });
  const camera = { scale: 1, centerX: 0.5, centerY: 0.5 };
  const ready = vi.fn();
  try {
    await act(async () =>
      root.render(
        <ReviewPreviewRendererContext.Provider value="legacy">
          <ZoomPreviewCanvas
            background={{ enabled: false }}
            imageUrl={null}
            camera={camera}
            frame={{ image: video, ...output }}
            output={output}
            view="result"
            cornerRadius={0}
            layout={computeQuickEditSceneLayout({
              output,
              source: output,
              background: { enabled: false },
              camera,
            })}
            live
            onCenter={vi.fn()}
            onPaintReady={ready}
          />
        </ReviewPreviewRendererContext.Provider>
      )
    );
    expect(ready).toHaveBeenLastCalledWith(true);
    expect(host.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
