// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ZoomPreviewCanvas } from './zoom-preview-canvas';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';

it('retains the Area raster while moving its focus and redraws changed raster inputs', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
    vi.unstubAllGlobals();
  }
});
