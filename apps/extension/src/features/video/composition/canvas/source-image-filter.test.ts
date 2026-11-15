// @vitest-environment jsdom
import { applySourceImageFilters } from '../../../image-filters/reference';
import { expect, it, vi } from 'vitest';
import { createSourceImageFilter } from '../../../image-filters/contract';
import { withSourceImageFilterCanvas } from './source-image-filter';
import type { RenderResources } from './render-resources';
function fixture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 2;
  const context = canvas.getContext('2d')!;
  const releaseCanvas = vi.fn(),
    releaseBytes = vi.fn();
  const resources: RenderResources = {
    canvas: vi.fn(() => ({ canvas, context, release: releaseCanvas })),
    bytes: vi.fn(() => ({ release: releaseBytes })),
  };
  const color = createSourceImageFilter('color', 'color');
  if (color.kind !== 'color') throw new Error('Expected color.');
  color.parameters.brightness = 2;
  const stack = { version: 1 as const, filters: [color] };
  return { canvas, resources, releaseCanvas, releaseBytes, color, stack };
}
it('matches analytic color while snapshotting parameters and releasing owned leases', () => {
  const f = fixture();
  let output: number[] = [];
  withSourceImageFilterCanvas(
    {
      stack: f.stack,
      logical: { width: 4, height: 2 },
      raster: { width: 4, height: 2 },
      resources: f.resources,
      paint(context) {
        context.fillStyle = 'rgb(32,64,96)';
        context.fillRect(0, 0, 4, 2);
        f.color.parameters.brightness = 1;
      },
    },
    (canvas) => {
      output = [...canvas.getContext('2d')!.getImageData(1, 1, 1, 1).data];
    }
  );
  expect(output).toEqual([64, 128, 192, 255]);
  expect(f.releaseCanvas).toHaveBeenCalledOnce();
  expect(f.releaseBytes).toHaveBeenCalledOnce();
});
it.each(['paint', 'consume'] as const)('releases both leases after a %s refusal', (phase) => {
  const f = fixture();
  expect(() =>
    withSourceImageFilterCanvas(
      {
        stack: f.stack,
        logical: { width: 4, height: 2 },
        raster: { width: 4, height: 2 },
        resources: f.resources,
        paint() {
          if (phase === 'paint') throw new Error('Paint refused.');
        },
      },
      () => {
        if (phase === 'consume') throw new Error('Consume refused.');
      }
    )
  ).toThrow();
  expect(f.releaseCanvas).toHaveBeenCalledOnce();
  expect(f.releaseBytes).toHaveBeenCalledOnce();
});
it('refuses a working budget before allocating a canvas and releases it after canvas refusal', () => {
  const f = fixture();
  vi.mocked(f.resources.bytes).mockImplementationOnce(() => {
    throw new Error('Budget refused.');
  });
  const args = {
    stack: f.stack,
    logical: { width: 4, height: 2 },
    raster: { width: 4, height: 2 },
    resources: f.resources,
    paint: vi.fn(),
  };
  expect(() => withSourceImageFilterCanvas(args, vi.fn())).toThrow('Budget refused');
  expect(f.resources.canvas).not.toHaveBeenCalled();
  vi.mocked(f.resources.canvas).mockImplementationOnce(() => {
    throw new Error('Canvas refused.');
  });
  expect(() => withSourceImageFilterCanvas(args, vi.fn())).toThrow('Canvas refused');
  expect(f.releaseBytes).toHaveBeenCalledOnce();
});
it('owns and clears its temporary canvas when no shared resources are injected', () => {
  const f = fixture();
  let borrowed: HTMLCanvasElement | undefined;
  withSourceImageFilterCanvas(
    {
      stack: f.stack,
      logical: { width: 4, height: 2 },
      raster: { width: 4, height: 2 },
      paint(context) {
        context.fillStyle = '#fff';
        context.fillRect(0, 0, 4, 2);
      },
    },
    (canvas) => {
      borrowed = canvas;
      expect(canvas.width).toBe(4);
    }
  );
  expect(borrowed?.width).toBe(0);
  expect(borrowed?.height).toBe(0);
});
it('refuses unknown stack and unsafe dimensions before any resource admission', () => {
  const f = fixture();
  for (const stack of [null, { version: 99, filters: [] }])
    expect(() =>
      withSourceImageFilterCanvas(
        {
          stack,
          logical: { width: 4, height: 2 },
          raster: { width: 4, height: 2 },
          resources: f.resources,
          paint: vi.fn(),
        },
        vi.fn()
      )
    ).toThrow();
  expect(() =>
    withSourceImageFilterCanvas(
      {
        stack: f.stack,
        logical: { width: 4, height: 2 },
        raster: { width: 16384, height: 16384 },
        resources: f.resources,
        paint: vi.fn(),
      },
      vi.fn()
    )
  ).toThrow();
  expect(f.resources.bytes).not.toHaveBeenCalled();
  expect(f.resources.canvas).not.toHaveBeenCalled();
});

it('captures the project clock before caller painting can mutate its input object', () => {
  const f = fixture(),
    grain = createSourceImageFilter('grain', 'grain');
  if (grain.kind !== 'grain') throw new Error('Expected grain');
  grain.parameters.amount = 0.8;
  const input = new Uint8ClampedArray(Array.from({ length: 8 }, () => [128, 128, 128, 255]).flat());
  const args = {
    stack: { version: 1, filters: [grain] },
    projectTime: 0.2,
    logical: { width: 4, height: 2 },
    raster: { width: 4, height: 2 },
    resources: f.resources,
    paint(context: CanvasRenderingContext2D) {
      context.fillStyle = 'rgb(128,128,128)';
      context.fillRect(0, 0, 4, 2);
      args.projectTime = 0.8;
    },
  };
  let result: Uint8ClampedArray | undefined;
  withSourceImageFilterCanvas(args, (canvas) => {
    result = canvas.getContext('2d')!.getImageData(0, 0, 4, 2).data;
  });
  expect(result && [...result]).toEqual([
    ...applySourceImageFilters(input, 4, 2, args.stack, args.logical, 0.2),
  ]);
  expect(f.releaseCanvas).toHaveBeenCalledOnce();
  expect(f.releaseBytes).toHaveBeenCalledOnce();
});
