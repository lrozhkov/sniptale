import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildDynamicFreehandPathDataMock: vi.fn(),
  createFabricShadowMock: vi.fn<() => { blur: number } | null>(() => ({ blur: 6 })),
  hexToRgbaMock: vi.fn((color: string, opacity: number) => `${color}:${opacity}`),
  saveAndTransformMock: vi.fn(),
  superRenderMock: vi.fn(),
}));

vi.mock('fabric', async () => await import('./fabric-brush.test-support'));
vi.mock('../../objects/shadow', async () => ({
  ...(await vi.importActual<typeof import('../../objects/shadow')>('../../objects/shadow')),
  createFabricShadow: mocks.createFabricShadowMock,
}));
vi.mock('./dynamic-width', () => ({
  buildDynamicFreehandPathData: mocks.buildDynamicFreehandPathDataMock,
}));
vi.mock('../../document/model', async () => ({
  ...(await vi.importActual<typeof import('../../document/model')>('../../document/model')),
  hexToRgba: mocks.hexToRgbaMock,
}));

import { Point } from 'fabric';
import { EditorFreehandBrush, configureLiveFreehandBrush } from './brush';
import { setFabricBrushMockHooks } from './fabric-brush.test-support';

const canvas = { getZoom: () => 1 };

beforeEach(() => {
  vi.clearAllMocks();
  setFabricBrushMockHooks({
    saveAndTransform: mocks.saveAndTransformMock,
    superRender: mocks.superRenderMock,
  });
});

it('forces full top-canvas rerender for dynamic-width live previews', () => {
  const brush = configureLiveFreehandBrush(
    canvas as never,
    {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 1,
      shapeCorrection: 'off',
      shadow: 0,
      smoothingLevel: 10,
      width: 9,
    },
    null
  );

  expect(brush.needsFullRender()).toBe(true);
});

it('renders dynamic-width live preview as a filled path on the top canvas', () => {
  const brush = configureLiveFreehandBrush(
    { ...canvas, contextTop: {} } as never,
    {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 1,
      shapeCorrection: 'off',
      shadow: 0,
      smoothingLevel: 10,
      width: 9,
    },
    null
  );
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
  };
  mocks.buildDynamicFreehandPathDataMock.mockReturnValueOnce([
    ['M', 1, 2],
    ['L', 3, 4],
    ['Q', 5, 6, 7, 8],
    ['Z'],
  ]);

  brush.onMouseDown(new Point(1, 2), { e: { timeStamp: 10 } } as never);
  brush.onMouseMove(new Point(3, 4), { e: { timeStamp: 20 } } as never);
  (brush as EditorFreehandBrush & { _render: (context: typeof ctx) => void })._render(ctx);

  expect(mocks.saveAndTransformMock).toHaveBeenCalledWith(ctx);
  expect(ctx.moveTo).toHaveBeenCalledWith(1, 2);
  expect(ctx.lineTo).toHaveBeenCalledWith(3, 4);
  expect(ctx.quadraticCurveTo).toHaveBeenCalledWith(5, 6, 7, 8);
  expect(ctx.closePath).toHaveBeenCalledOnce();
  expect(ctx.fillStyle).toBe('#00aa00:1');
  expect(ctx.fill).toHaveBeenCalledOnce();
  expect(ctx.restore).toHaveBeenCalledOnce();
});

it('renders dynamic-width live preview with committed-quality samples', () => {
  const brush = configureLiveFreehandBrush(
    { ...canvas, contextTop: {} } as never,
    {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 1,
      shapeCorrection: 'off',
      shadow: 0,
      smoothingLevel: 10,
      width: 9,
    },
    null
  );
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
  };
  mocks.buildDynamicFreehandPathDataMock.mockReturnValueOnce([['M', 1, 2], ['L', 3, 4], ['Z']]);

  brush.onMouseDown(new Point(0, 0), { e: { timeStamp: 0 } } as never);
  for (let index = 1; index <= 420; index += 1) {
    brush.onMouseMove(new Point(index * 3, index % 7), {
      e: { timeStamp: index * 4 },
    } as never);
  }
  (brush as EditorFreehandBrush & { _render: (context: typeof ctx) => void })._render(ctx);

  const [, , previewSamples, options] = mocks.buildDynamicFreehandPathDataMock.mock.calls[0]!;
  expect(previewSamples).toHaveLength(421);
  expect(previewSamples.at(-1)).toEqual({ t: 1680, x: 1260, y: 0 });
  expect(options).toBeUndefined();
});

it('coalesces dense dynamic-width pointer samples while keeping the latest pointer', () => {
  const brush = configureLiveFreehandBrush(
    { ...canvas, contextTop: {} } as never,
    {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 1,
      shapeCorrection: 'off',
      shadow: 0,
      smoothingLevel: 10,
      width: 9,
    },
    null
  );
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
  };
  mocks.buildDynamicFreehandPathDataMock.mockReturnValueOnce([['M', 1, 2], ['L', 3, 4], ['Z']]);

  brush.onMouseDown(new Point(0, 0), { e: { timeStamp: 0 } } as never);
  for (let index = 1; index <= 420; index += 1) {
    brush.onMouseMove(new Point(index * 0.25, 0), {
      e: { timeStamp: index * 4 },
    } as never);
  }
  (brush as EditorFreehandBrush & { _render: (context: typeof ctx) => void })._render(ctx);

  const [, , previewSamples, options] = mocks.buildDynamicFreehandPathDataMock.mock.calls[0]!;
  expect(previewSamples.length).toBeLessThan(80);
  expect(previewSamples.at(-1)).toEqual({ t: 1680, x: 105, y: 0 });
  expect(options).toBeUndefined();
});

it('does not collapse a drawn segment when the pointer doubles back', () => {
  const brush = configureLiveFreehandBrush(
    { ...canvas, contextTop: {} } as never,
    {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 1,
      shapeCorrection: 'off',
      shadow: 0,
      smoothingLevel: 10,
      width: 9,
    },
    null
  );
  const ctx = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillStyle: '',
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
  };
  mocks.buildDynamicFreehandPathDataMock.mockReturnValueOnce([['M', 1, 2], ['L', 3, 4], ['Z']]);

  brush.onMouseDown(new Point(0, 0), { e: { timeStamp: 0 } } as never);
  brush.onMouseMove(new Point(10, 0), { e: { timeStamp: 10 } } as never);
  brush.onMouseMove(new Point(1, 0), { e: { timeStamp: 20 } } as never);
  (brush as EditorFreehandBrush & { _render: (context: typeof ctx) => void })._render(ctx);

  const [, , previewSamples] = mocks.buildDynamicFreehandPathDataMock.mock.calls[0]!;
  expect(previewSamples).toEqual([
    { t: 0, x: 0, y: 0 },
    { t: 10, x: 10, y: 0 },
    { t: 20, x: 1, y: 0 },
  ]);
});

it('falls back to Fabric rendering when dynamic-width preview cannot be built', () => {
  const brush = configureLiveFreehandBrush(
    canvas as never,
    {
      color: '#00aa00',
      dynamicWidth: true,
      opacity: 1,
      shapeCorrection: 'off',
      shadow: 0,
      smoothingLevel: 10,
      width: 9,
    },
    null
  );
  const ctx = {};
  mocks.buildDynamicFreehandPathDataMock.mockReturnValueOnce(null);

  brush.onMouseDown(new Point(1, 2), { e: { timeStamp: 10 } } as never);
  brush.onMouseMove(new Point(3, 4), { e: { timeStamp: 20 } } as never);
  (brush as EditorFreehandBrush & { _render: (context: typeof ctx) => void })._render(ctx);

  expect(mocks.superRenderMock).toHaveBeenCalledWith(ctx);
});
