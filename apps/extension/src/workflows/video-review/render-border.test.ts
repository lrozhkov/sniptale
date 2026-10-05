import { afterEach, expect, it, vi } from 'vitest';
import { drawReviewBorders } from './render-border';
import type { QuickEditBorderFrame } from '../../features/video/review/advanced/border';

const output = { width: 120, height: 80 };
const frame: QuickEditBorderFrame = {
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
  { style: 'solid' as const, dash: [], cap: 'butt' },
  { style: 'dashed' as const, dash: [12, 8], cap: 'butt' },
  { style: 'dotted' as const, dash: [0, 8], cap: 'round' },
])('reveals a wrapping $style segment without moving its pattern phase', ({ style, dash, cap }) => {
  const { destination, layer, mask } = compositor();
  drawReviewBorders(target(destination.context), output, [
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
  drawReviewBorders(
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
  drawReviewBorders(target(destination.context), output, []);
  expect(createElement).not.toHaveBeenCalled();
  drawReviewBorders(target(destination.context), output, [
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
    expect(() => drawReviewBorders(target(parts.destination.context), output, [frame])).toThrow(
      'Border compositor is unavailable.'
    );
    expect(parts.destination.context.save).not.toHaveBeenCalled();
    expect(parts.destination.context.drawImage).not.toHaveBeenCalled();
  }
);
