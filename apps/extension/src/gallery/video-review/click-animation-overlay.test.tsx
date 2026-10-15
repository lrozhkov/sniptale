// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { REVIEW_CLICK_DEFAULT } from '../../features/video/review/advanced/click-animation';
import { ReviewClickOverlay } from './click-animation-overlay';

it('keeps a bounded raster and clears its outer mapping when leaving spatial zoom', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    cues: [
      {
        settings: { ...REVIEW_CLICK_DEFAULT, effect: 'ripple' as const },
        point: { x: 0.1, y: 0.5 },
        anchor: 1,
        start: 1,
        end: 1.6,
      },
    ],
    time: 1.2,
    output: { width: 800, height: 450 },
    video: { x: 100, y: 60, width: 600, height: 330 },
    sourceWidth: 160,
    clip: { rect: { x: 100, y: 60, width: 600, height: 330 }, radius: 12 },
  };
  try {
    await act(async () =>
      root.render(<ReviewClickOverlay {...props} transform={{ scale: 2.3, x: -520, y: -270 }} />)
    );
    const canvas = host.querySelector('canvas')!;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(450);
    expect(canvas.style.transformOrigin).toBe('0 0');
    expect(canvas.style.transform).toBe('matrix(2.3, 0, 0, 2.3, -520, -270)');
    await act(async () => root.render(<ReviewClickOverlay {...props} />));
    expect(host.querySelector('canvas')).toBe(canvas);
    expect(canvas.style.transform).toBe('');
    expect(canvas.style.transformOrigin).toBe('');
    await act(async () => root.render(<ReviewClickOverlay {...props} time={2} />));
    expect(host.querySelector('canvas')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    context.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('paints the raster-local click and repaints its lens after paused video decoding', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const paint = {
    clearRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    drawImage: vi.fn(),
    setTransform: vi.fn(),
  };
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(paint as unknown as CanvasRenderingContext2D);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const props = {
    cues: [
      {
        settings: { ...REVIEW_CLICK_DEFAULT, effect: 'ripple' as const },
        point: { x: 0.1, y: 0.5 },
        anchor: 1,
        start: 1,
        end: 1.6,
      },
    ],
    time: 1.2,
    output: { width: 800, height: 450 },
    video: { x: 100, y: 60, width: 600, height: 330 },
    sourceWidth: 160,
    clip: { rect: { x: 100, y: 60, width: 600, height: 330 }, radius: 12 },
    transform: { scale: 2.3, x: -520, y: -270 },
  };
  const video = document.createElement('video');
  const ready = vi.spyOn(video, 'readyState', 'get').mockReturnValue(1);
  try {
    await act(async () => root.render(<ReviewClickOverlay {...props} />));
    expect(paint.clearRect).toHaveBeenCalledWith(0, 0, 800, 450);
    expect(paint.arc).toHaveBeenCalledWith(160, 225, expect.any(Number), 0, 2 * Math.PI);
    expect(paint.roundRect).toHaveBeenCalledWith(100, 60, 600, 330, 12);
    const lens = [
      { ...props.cues[0]!, settings: { ...REVIEW_CLICK_DEFAULT, effect: 'magnify' as const } },
    ];
    await act(async () =>
      root.render(<ReviewClickOverlay {...props} cues={lens} getFrame={() => video} />)
    );
    expect(paint.drawImage).not.toHaveBeenCalled();
    ready.mockReturnValue(2);
    video.dispatchEvent(new Event('seeked'));
    expect(paint.drawImage).toHaveBeenCalledWith(
      video,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
    const header = document.createElement('canvas');
    header.width = 160;
    const window = {
      videoRect: props.video,
      windowRect: { x: 100, y: 10, width: 600, height: 380 },
    };
    paint.drawImage.mockClear();
    await act(async () =>
      root.render(
        <ReviewClickOverlay
          {...props}
          cues={[lens[0]!, lens[0]!]}
          getFrame={() => video}
          headerImage={header}
          window={window}
        />
      )
    );
    const originals = paint.drawImage.mock.calls.filter(([source]) => source === video);
    const headers = paint.drawImage.mock.calls.filter(([source]) => source === header);
    const lenses = paint.drawImage.mock.calls.filter(
      ([source]) => source !== video && source !== header
    );
    expect(originals).toHaveLength(1);
    expect(headers).toHaveLength(1);
    expect(lenses).toHaveLength(2);
    expect(lenses[0]![0]).toBe(lenses[1]![0]);
    paint.drawImage.mockClear();
    video.dispatchEvent(new Event('timeupdate'));
    expect(paint.drawImage.mock.calls.filter(([source]) => source === video)).toHaveLength(1);
    paint.drawImage.mockClear();
    await act(async () =>
      root.render(
        <ReviewClickOverlay
          {...props}
          getFrame={() => video}
          headerImage={header}
          window={window}
        />
      )
    );
    expect(paint.drawImage).not.toHaveBeenCalled();
    await act(async () => root.render(<ReviewClickOverlay {...props} cues={[]} />));
    paint.drawImage.mockClear();
    video.dispatchEvent(new Event('seeked'));
    expect(paint.drawImage).not.toHaveBeenCalled();
    expect(host.querySelector('canvas')).toBeNull();
    await act(async () => root.render(<ReviewClickOverlay {...props} video={undefined} />));
    expect(host.querySelector('canvas')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    ready.mockRestore();
    context.mockRestore();
    vi.unstubAllGlobals();
  }
});
