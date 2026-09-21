import { createGradientPaint } from '@sniptale/foundation/paint';
import { expect, it, vi } from 'vitest';
import { createCanvasComment } from '../../features/video/review/comments';
import { parseReviewOperation } from '../../features/video/review/validation';
import { drawReviewSceneFrame } from './render-export';

function contextFixture() {
  return {
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textBaseline: '',
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 6 })),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

const scene = {
  canvas: { width: 160, height: 90 },
  layout: {
    contentRect: { x: 0, y: 0, width: 160, height: 90 },
    videoRect: { x: 0, y: 0, width: 160, height: 90 },
    videoTransform: { x: 0, y: 0, width: 160, height: 90 },
  },
  background: { enabled: false } as const,
  image: null,
  sample: { draw: vi.fn() } as never,
  sourceTime: 0,
  cameraScale: 1,
};

it('draws below-placed bubbles under the anchor point', () => {
  const context = contextFixture();
  drawReviewSceneFrame(context, {
    ...scene,
    canvas: { width: 176, height: 104 },
    layout: {
      contentRect: { x: 8, y: 8, width: 160, height: 88 },
      videoRect: { x: 8, y: 8, width: 160, height: 88 },
      videoTransform: { x: 4, y: 2, width: 168, height: 104 },
    },
    comments: [
      { ...createCanvasComment({ id: 'c', at: 0 }), placement: 'below', resolvedText: 'Hi' },
    ],
  });
  const boxY = vi.mocked(context.roundRect).mock.calls[0]![1] as number;
  expect(boxY).toBeGreaterThan(60);
});

it('renders custom comment geometry and a real Canvas gradient', () => {
  const context = contextFixture();
  const stops = vi.fn();
  const gradient = { addColorStop: stops } as unknown as CanvasGradient;
  context.createLinearGradient = vi.fn(() => gradient);
  context.translate = vi.fn();
  const comment = createCanvasComment({ id: 'style', at: 0 });
  let id = 0;
  comment.style = {
    ...comment.style,
    fillPaint: createGradientPaint('#ff0000', () => `stop-${id++}`),
    width: 320,
    fontSize: 18,
    padding: 12,
    radius: 8,
  };
  drawReviewSceneFrame(context, { ...scene, comments: [{ ...comment, resolvedText: 'Hi' }] });
  expect(context.font).toBe('18px ui-sans-serif, system-ui, sans-serif');
  expect(context.createLinearGradient).toHaveBeenCalledOnce();
  expect(stops).toHaveBeenCalled();
  expect(context.roundRect).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 36, 48, 8);
});

it('bounds accepted long comment dense-gradient raster work to the output frame', () => {
  const context = contextFixture();
  context.translate = vi.fn();
  const allocations: number[][] = [];
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      constructor(width: number, height: number) {
        allocations.push([width, height]);
        if (width > 160 || height > 90) throw new Error('Unbounded comment raster');
      }
      getContext() {
        return {
          createImageData: (width: number, height: number) => ({
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: vi.fn(),
        };
      }
    }
  );
  try {
    const comment = createCanvasComment({ id: 'long', at: 0 });
    const paint = createGradientPaint('#ff0000', () => crypto.randomUUID());
    if (paint.kind !== 'gradient') throw new Error('Expected gradient fixture');
    paint.gradient.repeat = { enabled: true, span: 0.01 };
    paint.gradient.stops[1]!.position = 0.01;
    comment.style = { ...comment.style, fillPaint: paint, fontSize: 48 };
    comment.text = 'x\n'.repeat(40_000);
    expect(
      parseReviewOperation(
        { id: 'add', at: 0, target: 'canvasComment', before: null, after: comment },
        4
      )
    ).not.toBeNull();
    drawReviewSceneFrame(context, {
      ...scene,
      comments: [{ ...comment, resolvedText: comment.text }],
      cameraScale: 2,
    });
    expect(allocations).toHaveLength(1);
    expect(context.fillText).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
