import { afterEach, expect, it, vi } from 'vitest';
import { drawSceneBorders } from '../../features/video/composition/draw/border';
import type { SceneBorderFrame } from '../../features/video/composition/scene-border';

const output = { width: 120, height: 80 };
const frame: SceneBorderFrame = {
  id: 'border',
  path: 'M10 10H110V70H10Z',
  perimeter: 320,
  width: 4,
  color: '#ff8800',
  style: 'solid',
  start: 0,
  end: 1,
  opacity: 1,
};

function surface() {
  const context = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    lineWidth: 1,
    strokeStyle: '',
    lineCap: 'butt',
    lineDashOffset: 0,
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn((_image: unknown, _x: number, _y: number) => {
      operations.push(context.globalCompositeOperation);
    }),
  };
  const operations: string[] = [];
  const canvas = { width: 0, height: 0, getContext: vi.fn(() => context) };
  return { context, canvas, operations };
}
function compositor() {
  const destination = surface(),
    layer = surface(),
    mask = surface();
  const createElement = vi.fn().mockReturnValueOnce(layer.canvas).mockReturnValueOnce(mask.canvas);
  vi.stubGlobal('document', { createElement });
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(public path: string) {}
    }
  );
  return { destination, layer, mask, createElement };
}
const target = (context: ReturnType<typeof surface>['context']) =>
  context as unknown as CanvasRenderingContext2D;
afterEach(() => vi.unstubAllGlobals());

it.each([
  { style: 'dashed' as const, dash: [12, 8], cap: 'butt' },
  { style: 'dotted' as const, dash: [0.01, 7.99], cap: 'round' },
])('reveals a wrapping $style segment without moving its pattern phase', ({ style, dash, cap }) => {
  const { destination, layer, mask } = compositor();
  drawSceneBorders(target(destination.context), output, [
    { ...frame, style, start: 0.9, end: 1.15, opacity: 0.4 },
  ]);
  expect(layer.context.setLineDash).toHaveBeenCalledWith(dash);
  expect(layer.context.lineCap).toBe(cap);
  expect(layer.context.lineDashOffset).toBe(0);
  expect(layer.context.lineWidth).toBe(4);
  expect(layer.context.strokeStyle).toBe('#ff8800');
  expect(layer.context.stroke).toHaveBeenCalledWith(expect.objectContaining({ path: frame.path }));
  expect(mask.context.setLineDash.mock.calls[0]![0][0]).toBeCloseTo(80);
  expect(mask.context.setLineDash.mock.calls[0]![0][1]).toBeCloseTo(240);
  expect(mask.context.lineDashOffset).toBe(-288);
  expect(mask.context.lineWidth).toBe(6);
  expect(mask.context.lineCap).toBe('butt');
  // A full-canvas mask removes the unpainted gaps; destination-in stroke alone cannot.
  expect(layer.context.drawImage).toHaveBeenCalledWith(mask.canvas, 0, 0);
  expect(layer.operations).toEqual(['destination-in']);
  expect(destination.context.drawImage).toHaveBeenCalledWith(layer.canvas, 0, 0);
  expect(destination.context.globalAlpha).toBe(0.4);
  expect(layer.canvas).toMatchObject(output);
  expect(mask.canvas).toMatchObject(output);
});

it('clips ordered strokes to the visible rounded window and leaves a full line unmasked', () => {
  const { destination, layer, mask } = compositor();
  drawSceneBorders(
    target(destination.context),
    output,
    [frame, { ...frame, id: 'later', opacity: 0.6 }],
    {
      rect: { x: 20, y: 10, width: 80, height: 60 },
      radius: 8,
    }
  );
  expect(destination.context.roundRect).toHaveBeenCalledWith(20, 10, 80, 60, 8);
  expect(destination.context.clip).toHaveBeenCalledOnce();
  expect(destination.context.save).toHaveBeenCalledOnce();
  expect(destination.context.restore).toHaveBeenCalledOnce();
  expect(layer.context.clearRect).toHaveBeenCalledTimes(2);
  expect(layer.context.stroke).toHaveBeenCalledTimes(2);
  expect(mask.context.stroke).not.toHaveBeenCalled();
  expect(layer.context.drawImage).not.toHaveBeenCalled();
  expect(destination.context.drawImage).toHaveBeenCalledTimes(2);
  expect(destination.context.globalAlpha).toBe(0.6);
});

it('does not allocate a compositor for no frames or paint zero-length and invisible strokes', () => {
  const { destination, layer, createElement } = compositor();
  drawSceneBorders(target(destination.context), output, []);
  expect(createElement).not.toHaveBeenCalled();
  drawSceneBorders(target(destination.context), output, [
    { ...frame, opacity: 0 },
    { ...frame, start: 0.7, end: 0.2 },
  ]);
  expect(layer.context.stroke).not.toHaveBeenCalled();
  expect(destination.context.drawImage).not.toHaveBeenCalled();
});

it.each(['layer', 'mask'] as const)(
  'fails before touching the destination when the %s context is unavailable',
  (missing) => {
    const parts = compositor();
    parts[missing].canvas.getContext.mockReturnValue(
      null as unknown as ReturnType<typeof surface>['context']
    );
    expect(() => drawSceneBorders(target(parts.destination.context), output, [frame])).toThrow(
      'Border compositor is unavailable.'
    );
    expect(parts.destination.context.save).not.toHaveBeenCalled();
    expect(parts.destination.context.drawImage).not.toHaveBeenCalled();
  }
);

it('moves a full patterned perimeter and resets its phase for a following static frame', () => {
  const { destination, layer, mask } = compositor();
  const phases: number[] = [];
  layer.context.stroke.mockImplementation(() => {
    phases.push(layer.context.lineDashOffset);
  });
  drawSceneBorders(target(destination.context), output, [
    { ...frame, style: 'dashed', dashOffset: -37 },
    { ...frame, style: 'dotted', dashOffset: -61 },
    frame,
  ]);
  expect(phases).toEqual([-37, -61, 0]);
  expect(mask.context.stroke).not.toHaveBeenCalled();
});

it.each([
  { start: 0, end: 0.25 },
  { start: 0.75, end: 1 },
  { start: 0.9, end: 1.15 },
])('paints partial solid strokes with native round endpoints: $start to $end', ({ start, end }) => {
  const { destination, layer, mask } = compositor();
  drawSceneBorders(target(destination.context), output, [{ ...frame, start, end }]);
  expect(layer.context.lineCap).toBe('round');
  expect(layer.context.setLineDash.mock.calls.at(-1)?.[0][0]).toBeCloseTo(80);
  expect(layer.context.setLineDash.mock.calls.at(-1)?.[0][1]).toBeCloseTo(240);
  expect(layer.context.lineDashOffset).toBeCloseTo(-start * frame.perimeter);
  expect(mask.context.stroke).not.toHaveBeenCalled();
  expect(layer.context.drawImage).not.toHaveBeenCalled();
});

it.each(['dashed', 'dotted'] as const)(
  'fits %s repeats to arbitrary closed perimeters',
  (style) => {
    for (const perimeter of [3, 317, 321.125, 1000 + 35 * Math.PI]) {
      const { destination, layer } = compositor();
      drawSceneBorders(target(destination.context), output, [
        { ...frame, style, perimeter, dashOffset: -17.5 },
      ]);
      const pattern = layer.context.setLineDash.mock.calls[0]![0];
      const pitch = pattern[0] + pattern[1];
      const repeats = perimeter / pitch;
      expect(repeats).toBeCloseTo(Math.round(repeats), 10);
      expect(repeats).toBeGreaterThanOrEqual(1);
      if (style === 'dashed') expect(pattern[0] / pitch).toBeCloseTo(0.6);
      else expect(pattern[0]).toBeGreaterThan(0);
      expect(layer.context.lineDashOffset).toBe(-17.5);
    }
  }
);

it('does not introduce a reveal seam for a full perimeter with floating-point subtraction', () => {
  const { destination, mask } = compositor();
  drawSceneBorders(target(destination.context), output, [
    { ...frame, style: 'dotted', start: 0.1, end: 1.1 - Number.EPSILON },
  ]);
  expect(mask.context.stroke).not.toHaveBeenCalled();
});

function managedCompositor() {
  const parts = compositor();
  const layerRelease = vi.fn(),
    maskRelease = vi.fn();
  const canvas = vi.fn((role: string, size: { width: number; height: number }) => {
    const source = role === 'border-layer' ? parts.layer : parts.mask;
    source.canvas.width = size.width;
    source.canvas.height = size.height;
    return {
      canvas: source.canvas as unknown as HTMLCanvasElement,
      context: target(source.context),
      release: role === 'border-layer' ? layerRelease : maskRelease,
    };
  });
  return { ...parts, canvas, layerRelease, maskRelease, resources: { canvas, bytes: vi.fn() } };
}

it('reuses two managed surfaces across patterned and solid frames without DOM allocation', () => {
  const p = managedCompositor();
  drawSceneBorders(
    target(p.destination.context),
    output,
    [
      { ...frame, style: 'dashed', start: 0.25, end: 0.75, opacity: 0.4 },
      { ...frame, start: 0.1, end: 0.6, opacity: 0.8 },
    ],
    { rect: { x: 0, y: 0, width: 120, height: 80 }, radius: 8 },
    p.resources
  );
  expect(p.canvas.mock.calls).toEqual([
    ['border-layer', output],
    ['border-mask', output],
  ]);
  expect(p.createElement).not.toHaveBeenCalled();
  expect(p.mask.context.setLineDash).toHaveBeenCalledWith([160, 160]);
  expect(p.layer.operations).toEqual(['destination-in']);
  expect(p.layer.context.lineCap).toBe('round');
  expect(p.destination.context.drawImage).toHaveBeenCalledTimes(2);
  expect(p.destination.context.globalAlpha).toBe(0.8);
  expect(p.destination.context.clip).toHaveBeenCalledTimes(1);
  expect(p.layerRelease).toHaveBeenCalledTimes(1);
  expect(p.maskRelease).toHaveBeenCalledTimes(1);
});

it('does not acquire managed surfaces for an empty frame list', () => {
  const p = managedCompositor();
  drawSceneBorders(target(p.destination.context), output, [], undefined, p.resources);
  expect(p.canvas).not.toHaveBeenCalled();
});

it('releases the admitted layer when the second managed allocation fails', () => {
  const p = managedCompositor();
  const acquire = p.canvas.getMockImplementation()!;
  p.canvas.mockImplementation((role, size) => {
    if (role === 'border-mask') throw new Error('allocation refused');
    return acquire(role, size);
  });
  expect(() =>
    drawSceneBorders(target(p.destination.context), output, [frame], undefined, p.resources)
  ).toThrow('allocation refused');
  expect(p.layerRelease).toHaveBeenCalledTimes(1);
  expect(p.maskRelease).not.toHaveBeenCalled();
  expect(p.destination.context.save).not.toHaveBeenCalled();
});

it.each(['path', 'stroke', 'mask', 'publish'] as const)(
  'restores saved state and releases both leases when %s fails',
  (failure) => {
    const p = managedCompositor();
    const fail = () => {
      throw new Error('draw failed');
    };
    if (failure === 'path')
      vi.stubGlobal(
        'Path2D',
        class {
          constructor() {
            fail();
          }
        }
      );
    if (failure === 'stroke') p.layer.context.stroke.mockImplementation(fail);
    if (failure === 'mask') p.mask.context.stroke.mockImplementation(fail);
    if (failure === 'publish') p.destination.context.drawImage.mockImplementation(fail);
    expect(() =>
      drawSceneBorders(
        target(p.destination.context),
        output,
        [{ ...frame, style: 'dashed', start: 0, end: 0.5 }],
        undefined,
        p.resources
      )
    ).toThrow('draw failed');
    expect(p.layer.context.restore).toHaveBeenCalledTimes(1);
    expect(p.destination.context.restore).toHaveBeenCalledTimes(1);
    expect(p.layerRelease).toHaveBeenCalledTimes(1);
    expect(p.maskRelease).toHaveBeenCalledTimes(1);
  }
);

it('preserves the caller opacity independently for every border frame', () => {
  const { destination } = compositor();
  destination.context.globalAlpha = 0.25;
  const alphas: number[] = [];
  destination.context.drawImage.mockImplementation(() => {
    alphas.push(destination.context.globalAlpha);
  });
  drawSceneBorders(target(destination.context), output, [
    { ...frame, opacity: 0.4 },
    { ...frame, id: 'second', opacity: 0.8 },
  ]);
  expect(alphas).toEqual([0.1, 0.2]);
});

it('rasterizes transformed border and reveal paths once in destination device pixels', () => {
  const { destination, layer, mask } = compositor();
  const transform = { a: 2, b: 0, c: 0, d: 2, e: -100, f: -50 };
  drawSceneBorders(
    target(destination.context),
    output,
    [{ ...frame, style: 'dashed', start: 0.1, end: 0.7 }],
    undefined,
    undefined,
    transform
  );
  expect(layer.context.setTransform).toHaveBeenCalledWith(transform);
  expect(mask.context.setTransform).toHaveBeenCalledWith(transform);
  expect(destination.context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
});
