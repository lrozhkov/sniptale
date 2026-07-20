import { beforeEach, expect, it, vi } from 'vitest';

import { drawCompositionVisualLayer } from './index';

class FakeHTMLMediaElement {
  static HAVE_CURRENT_DATA = 2;
}

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createVideoLayer() {
  return {
    clip: { fitMode: 'STRETCH' },
    clipId: 'video-1',
    height: 50,
    kind: 'video',
    opacity: 1,
    renderState: {
      blurAmount: 0,
      opacityMultiplier: 1,
      scaleX: 1,
      scaleY: 1,
      translateX: 0,
      translateY: 0,
    },
    rotation: 0,
    width: 80,
    x: 10,
    y: 12,
    zIndex: 0,
  };
}

beforeEach(() => {
  vi.stubGlobal('HTMLMediaElement', FakeHTMLMediaElement);
  vi.stubGlobal('HTMLVideoElement', class extends FakeHTMLMediaElement {});
});

it('renders decoded frame sources through the video layer path', () => {
  const context = createContext();
  const draw = vi.fn();

  drawCompositionVisualLayer(
    context,
    createVideoLayer() as never,
    1,
    1,
    {},
    new Map([
      [
        'video-1',
        {
          draw,
          sourceHeight: 50,
          sourceWidth: 80,
        },
      ],
    ])
  );

  expect(draw).toHaveBeenCalledWith(context, 10, 12, 80, 50);
  expect(context.drawImage).not.toHaveBeenCalled();
});
