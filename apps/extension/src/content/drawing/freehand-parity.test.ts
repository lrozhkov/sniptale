import { expect, it, vi } from 'vitest';
import { buildDrawingStrokeOutline, type DrawingSample } from '../../features/drawing/public';
import { drawDrawingFrame } from './frame';

it('keeps page pencil geometry identical to the speed-based image-editor pencil', () => {
  const samples: DrawingSample[] = [
    { x: 10, y: 20, t: 0 },
    { x: 12, y: 22, t: 12 },
    { x: 24, y: 25, t: 20 },
    { x: 32, y: 42, t: 60 },
    { x: 48, y: 44, t: 90 },
  ];
  const drawingOutline = buildDrawingStrokeOutline(samples, 16, {
    dynamicWidth: true,
    smoothingLevel: 10,
  });
  // Frozen from the image-editor dynamic-width path for this exact mouse-speed sample set.
  expect(drawingOutline).toHaveLength(76);
  expect(drawingOutline.reduce((sum, point) => sum + point.x, 0)).toBeCloseTo(2203.918933986989, 8);
  expect(drawingOutline.reduce((sum, point) => sum + point.y, 0)).toBeCloseTo(2505.427084892861, 8);
  expect(drawingOutline[0]).toEqual({ x: 8.087290717470228, y: 24.194633271076817 });
  expect(drawingOutline[37]).toEqual({ x: 49.564329384611824, y: 39.671205433815445 });
  expect(drawingOutline.at(-1)).toEqual({ x: 7.066813728046293, y: 23.556659018281408 });
});

it.each(['pencil', 'marker'] as const)(
  'renders the same exact %s trajectory live and after release',
  (kind) => {
    const samples = Array.from({ length: 180 }, (_, index) => ({
      x: 40 + index * 3,
      y: 150 + Math.sin(index / 4) * 45,
      t: index * 2,
    }));
    const object = { id: 'stroke', kind, color: '#ef4444', width: 16, samples, opacity: 0.35 };
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
    } as unknown as CanvasRenderingContext2D;
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1 });
    const canvas = {
      style: {},
      width: 1280,
      height: 720,
      getContext: () => context,
    } as unknown as HTMLCanvasElement;
    const frame = {
      canvas,
      objects: [],
      selectedIds: [],
      root: { kind: 'viewport' as const, element: null },
      showChrome: false,
    };
    drawDrawingFrame({
      ...frame,
      draft: { kind: 'create', object, start: samples[0]!, arrowFromTip: false },
    });
    const live = [vi.mocked(context.moveTo).mock.calls, vi.mocked(context.lineTo).mock.calls];
    vi.mocked(context.moveTo).mockClear();
    vi.mocked(context.lineTo).mockClear();
    drawDrawingFrame({ ...frame, objects: [object], draft: null });
    expect([vi.mocked(context.moveTo).mock.calls, vi.mocked(context.lineTo).mock.calls]).toEqual(
      live
    );
    vi.unstubAllGlobals();
    const expected = buildDrawingStrokeOutline(samples, 16, {
      dynamicWidth: kind === 'pencil',
      smoothingLevel: 10,
    });
    expect(vi.mocked(context.moveTo).mock.calls).toEqual([[expected[0]!.x, expected[0]!.y]]);
    expect(vi.mocked(context.lineTo).mock.calls).toEqual(
      expected.slice(1).map((point) => [point.x, point.y])
    );
  }
);
