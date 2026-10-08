import { createGradientPaint } from '@sniptale/foundation/paint';
import { expect, it, vi } from 'vitest';
import { createCanvasComment } from '../../features/video/review/comments';
import { parseReviewOperation } from '../../features/video/review/validation';
import { drawReviewSceneFrame } from './scene-frame';

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

it.each(['content', 'viewport'] as const)(
  'keeps canonical %s wrapping at reduced portrait backing',
  async (attachment) => {
    const { drawReviewSceneComments } = await import('./scene-frame');
    const { computeQuickEditSceneLayout } =
      await import('../../features/video/review/advanced/scene');
    const canonical = { width: 600, height: 1100 };
    const backing = { width: 150, height: 275 };
    const background = { enabled: false as const };
    const camera = { scale: 1.3, centerX: 0.4, centerY: 0.6 };
    const layout = computeQuickEditSceneLayout({
      output: canonical,
      source: canonical,
      background,
      camera,
    });
    const smallerLayout = computeQuickEditSceneLayout({
      output: backing,
      source: canonical,
      background,
      camera,
    });
    const comment = {
      ...createCanvasComment({ id: 'canonical', at: 0 }),
      attachment,
      resolvedText: 'One two three four five six seven eight nine ten eleven twelve '.repeat(5),
    };
    const reference = contextFixture(),
      reduced = contextFixture();
    reduced.scale = vi.fn();
    const args = { ...scene, canvas: canonical, layout, comments: [comment], cameraScale: 1.3 };
    drawReviewSceneComments(reference, args);
    drawReviewSceneComments(reduced, {
      ...args,
      canvas: backing,
      layout: smallerLayout,
      commentSpace: { canvas: canonical, layout, background, cameraScale: 1.3 },
    });
    expect(reduced.scale).toHaveBeenCalledExactlyOnceWith(0.25, 0.25);
    expect(reduced.font).toBe(reference.font);
    expect(vi.mocked(reduced.fillText).mock.calls).toEqual(
      vi.mocked(reference.fillText).mock.calls
    );
    expect(vi.mocked(reduced.roundRect).mock.calls).toEqual(
      vi.mocked(reference.roundRect).mock.calls
    );
    expect(vi.mocked(reduced.arc).mock.calls).toEqual(vi.mocked(reference.arc).mock.calls);
    expect(reduced.restore).toHaveBeenCalledTimes(vi.mocked(reduced.save).mock.calls.length);
  }
);

it.each(['measureText', 'fillText'] as const)(
  'restores canonical and nested comment state after %s fails',
  async (method) => {
    const { drawReviewSceneComments } = await import('./scene-frame');
    const { computeQuickEditSceneLayout } =
      await import('../../features/video/review/advanced/scene');
    const context = contextFixture();
    context.scale = vi.fn();
    vi.mocked(context[method]).mockImplementation(() => {
      throw new Error('comment failed');
    });
    const canvas = { width: 600, height: 1100 };
    const layout = computeQuickEditSceneLayout({
      output: canvas,
      source: canvas,
      background: scene.background,
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    expect(() =>
      drawReviewSceneComments(context, {
        ...scene,
        comments: [{ ...createCanvasComment({ id: 'failure', at: 0 }), resolvedText: 'Text' }],
        commentSpace: { canvas, layout, background: scene.background },
      })
    ).toThrow('comment failed');
    expect(context.restore).toHaveBeenCalledTimes(vi.mocked(context.save).mock.calls.length);
  }
);

it.each([false, true])(
  'uses backing-sized dense-gradient leases and restores state on paint failure=%s',
  async (fail) => {
    const { drawReviewComments } = await import('./render-comments');
    const { getShowcaseGradient } = await import('../../features/highlighter/showcase-resources');
    const gradient = getShowcaseGradient('system-ocean');
    gradient.repeat = { enabled: true, span: 0.01 };
    const comment = createCanvasComment({ id: 'dense', at: 0 });
    const context = contextFixture();
    context.translate = vi.fn();
    const releases: ReturnType<typeof vi.fn>[] = [];
    const release = () => {
      const callback = vi.fn();
      releases.push(callback);
      return callback;
    };
    const canvas = vi.fn((_role: string, backing: { width: number; height: number }) => ({
      canvas: { ...backing } as HTMLCanvasElement,
      context: {
        createImageData: (width: number, height: number) => ({
          data: new Uint8ClampedArray(width * height * 4),
        }),
        putImageData: vi.fn(() => {
          if (fail) throw new Error('gradient failed');
        }),
      } as unknown as CanvasRenderingContext2D,
      release: release(),
    }));
    const draw = () =>
      drawReviewComments(
        context,
        [
          {
            ...comment,
            resolvedText: 'Canonical fill',
            style: { ...comment.style, fillPaint: { kind: 'gradient', gradient } },
          },
        ],
        {
          attachment: comment.attachment,
          canvas: { width: 600, height: 1100 },
          videoTransform: null,
          scale: 1,
          sourceTime: 0,
          rasterScale: { x: 0.25, y: 0.5 },
          resources: { canvas, bytes: () => ({ release: release() }) },
        }
      );
    if (fail) expect(draw).toThrow('gradient failed');
    else draw();
    expect(context.restore).toHaveBeenCalledTimes(vi.mocked(context.save).mock.calls.length);
    const box = vi.mocked(context.roundRect).mock.calls[0]!;
    expect(canvas).toHaveBeenCalledWith('gradient-dense', {
      width: Math.ceil(box[2] * 0.25),
      height: Math.ceil(box[3] * 0.5),
    });
    if (!fail)
      expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, box[2], box[3]);
    expect(releases.length).toBeGreaterThan(1);
    expect(releases.every((callback) => callback.mock.calls.length === 1)).toBe(true);
  }
);
