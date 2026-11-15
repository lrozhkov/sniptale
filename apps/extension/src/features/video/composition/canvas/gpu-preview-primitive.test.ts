import { afterEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeGpuPaint } from '../../../../contracts/effect-runtime/gpu-plan';
import { rasterizeGpuPreviewPaint } from './gpu-preview-primitive';

afterEach(() => vi.unstubAllGlobals());
const identity = [1, 0, 0, 1, 0, 0] as const;
function paint(): EffectRuntimeGpuPaint {
  return {
    transform: identity,
    path: [],
    draw: { op: 'fillRect', args: [1, 2, 30, 20] },
    style: {
      fill: '#ffffff',
      stroke: '#ff8800',
      font: '16px sans-serif',
      lineWidth: 2,
      lineCap: 'round',
      lineJoin: 'bevel',
      miterLimit: 10,
      textAlign: 'center',
      textBaseline: 'middle',
      direction: 'ltr',
    },
  };
}
function fixture() {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    roundRect: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    ellipse: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    createRadialGradient: vi.fn(() => gradient),
  };
  class Canvas {
    static all: Canvas[] = [];
    constructor(
      public width: number,
      public height: number
    ) {
      Canvas.all.push(this);
    }
    getContext = vi.fn(() => context);
  }
  vi.stubGlobal('OffscreenCanvas', Canvas);
  return { context, gradient, Canvas };
}
it('preserves curves, winding, clipping and independent path/draw transforms', () => {
  const { context } = fixture();
  const value = paint();
  const pathTransform = [1.2, 0.1, -0.2, 0.8, 12, 8] as const;
  value.clips = [{ rect: { x: 1, y: 2, width: 40, height: 25 }, transform: identity }];
  const commands: [string, (number | boolean)[]][] = [
    ['moveTo', [1, 2]],
    ['lineTo', [3, 4]],
    ['quadraticCurveTo', [1, 2, 3, 4]],
    ['bezierCurveTo', [1, 2, 3, 4, 5, 6]],
    ['rect', [1, 2, 3, 4]],
    ['roundRect', [1, 2, 3, 4, 2]],
    ['arc', [2, 3, 4, 0.1, 0.8, true]],
    ['arcTo', [1, 2, 3, 4, 2]],
    ['ellipse', [2, 3, 4, 5, 0.1, 0.2, 0.8, false]],
    ['closePath', []],
  ];
  value.path = commands.map(([op, args]) => ({ op, args, transform: pathTransform }));
  value.draw = { op: 'fill', args: ['evenodd'] };
  const canvas = rasterizeGpuPreviewPaint({ width: 64, height: 40, paint: value });
  expect([canvas.width, canvas.height]).toEqual([64, 40]);
  expect(context.clip).toHaveBeenCalledOnce();
  expect(context.quadraticCurveTo).toHaveBeenCalledWith(1, 2, 3, 4);
  expect(context.bezierCurveTo).toHaveBeenCalledWith(1, 2, 3, 4, 5, 6);
  expect(context.arc).toHaveBeenCalledWith(2, 3, 4, 0.1, 0.8, true);
  expect(context.arcTo).toHaveBeenCalledWith(1, 2, 3, 4, 2);
  expect(context.ellipse).toHaveBeenCalledWith(2, 3, 4, 5, 0.1, 0.2, 0.8, false);
  expect(context.setTransform).toHaveBeenLastCalledWith(...identity);
  expect(context.fill).toHaveBeenCalledWith('evenodd');
  expect(context.closePath.mock.invocationCallOrder[0]).toBeLessThan(
    context.fill.mock.invocationCallOrder[0]!
  );
});
it.each(['linear', 'radial'] as const)(
  'creates %s gradient before building the native path',
  (kind) => {
    const { context, gradient } = fixture();
    const value = paint();
    value.path = [{ op: 'rect', args: [1, 2, 30, 20], transform: identity }];
    value.draw = { op: 'stroke', args: [] };
    value.style.stroke = {
      kind,
      args: kind === 'linear' ? [0, 0, 20, 10] : [1, 2, 0, 3, 4, 10],
      transform: identity,
      stops: [
        [0, '#ffffff'],
        [1, '#ff880080'],
      ],
    };
    rasterizeGpuPreviewPaint({ width: 64, height: 40, paint: value });
    const create = kind === 'linear' ? context.createLinearGradient : context.createRadialGradient;
    expect(gradient.addColorStop.mock.calls).toEqual([
      [0, '#ffffff'],
      [1, '#ff880080'],
    ]);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      context.rect.mock.invocationCallOrder[0]!
    );
    expect(context.stroke).toHaveBeenCalledOnce();
  }
);
it.each([undefined, 24])('preserves text and optional maxWidth %s', (maxWidth) => {
  const { context } = fixture();
  const value = paint();
  value.draw = {
    op: 'fillText',
    args: maxWidth === undefined ? ['Aa Бб', 12, 16] : ['Aa Бб', 12, 16, maxWidth],
  };
  rasterizeGpuPreviewPaint({ width: 64, height: 40, paint: value });
  expect(context.fillText).toHaveBeenCalledWith('Aa Бб', 12, 16, maxWidth);
});
it('clears a failed materialization backing before propagating its native error', () => {
  const { context, Canvas } = fixture();
  const failure = new Error('Native fill failed');
  context.fillRect.mockImplementation(() => {
    throw failure;
  });
  expect(() => rasterizeGpuPreviewPaint({ width: 64, height: 40, paint: paint() })).toThrow(
    failure
  );
  expect([Canvas.all[0]!.width, Canvas.all[0]!.height]).toEqual([0, 0]);
});
