import { expect, it, vi } from 'vitest';
import { prepareDrawingSimplifySelection } from './simplify-object';
import { getDrawingSelectionBounds, getDrawingBoundsCenter } from '../../features/drawing/public';
import { resizeDrawingObject } from './interaction';
import { createDefaultSimplifySettings } from '../../features/simplify/settings';

it.each([0, 1])(
  'distinguishes exact source edges from genuinely missing pixels (outside=%i)',
  async (outside) => {
    const source = {
      dataUrl: 'retained',
      width: 1600,
      height: 1125,
      bounds: { x: 224.58703928983127, y: 450, width: 1280, height: 900 },
    };
    const render = vi.fn(async () => ({
      dataUrl: 'result',
      width: 1475,
      height: 126,
      version: 'test',
    }));
    const object = {
      id: 'mask',
      kind: 'simplify' as const,
      bounds: { x: 324.5870392898313, y: 500, width: 1180 + outside, height: 100 },
      settings: createDefaultSimplifySettings(),
      source,
    };
    const prepared = await prepareDrawingSimplifySelection(
      { objects: [object], baselines: new Map([[object.id, object]]), force: true, append: false },
      () => source,
      { render, decode: vi.fn(async () => undefined), current: () => true }
    );
    if (outside) {
      expect(prepared).toBeNull();
      expect(render).not.toHaveBeenCalled();
    } else {
      expect(prepared).toHaveLength(1);
      expect(render).toHaveBeenCalledWith(
        expect.objectContaining({ region: { x: 125, y: 62, width: 1475, height: 126 } })
      );
    }
  }
);

it.each([true, false])(
  'recomputes a source-bounded resize without acquisition (automatic=%s)',
  async (automatic) => {
    const { resizeDrawingObject } = await import('./interaction');
    const source = {
      dataUrl: 'retained',
      width: 1600,
      height: 1125,
      bounds: { x: 224.58703928983127, y: 450, width: 1280, height: 900 },
    };
    const object = {
      id: 'mask',
      kind: 'simplify' as const,
      bounds: { x: 324.5870392898313, y: 500, width: 200, height: 100 },
      settings: { ...createDefaultSimplifySettings(), automatic, manualKind: 'text' as const },
      source,
    };
    const resized = resizeDrawingObject(
      {
        kind: 'resize',
        handle: 'se',
        start: { x: object.bounds.x + 200, y: 600 },
        object,
        original: object,
      },
      { x: 3000, y: 3000 }
    );
    const acquire = vi.fn(async () => source),
      render = vi.fn(async () => ({
        dataUrl: 'result',
        width: 1200,
        height: 900,
        version: 'test',
      }));
    const result = await prepareDrawingSimplifySelection(
      { objects: [resized], baselines: new Map([[object.id, object]]), force: true, append: false },
      () => source,
      { acquire, render, decode: vi.fn(async () => undefined), current: () => true }
    );
    expect(result).toHaveLength(1);
    expect(acquire).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledOnce();
  }
);

it.each([
  ['n', { x: 220, y: -1000 }],
  ['ne', { x: 2000, y: -1000 }],
  ['e', { x: 2000, y: 690 }],
  ['se', { x: 2000, y: 2000 }],
  ['s', { x: 220, y: 2000 }],
  ['sw', { x: -1000, y: 2000 }],
  ['w', { x: -1000, y: 690 }],
  ['nw', { x: -1000, y: -1000 }],
] as const)(
  'stops source-dependent Simplify resize at the retained source edge (%s)',
  async (handle, point) => {
    const { createDefaultSimplifySettings } = await import('../../features/simplify/settings');
    const object = {
      id: 'bounded-mask',
      kind: 'simplify' as const,
      bounds: { x: 180, y: 660, width: 80, height: 60 },
      settings: createDefaultSimplifySettings(),
      source: {
        dataUrl: 'source',
        width: 500,
        height: 375,
        bounds: { x: 100, y: 600, width: 400, height: 300 },
      },
    };
    const start = {
      x: handle.includes('w') ? 180 : handle.includes('e') ? 260 : 220,
      y: handle.includes('n') ? 660 : handle.includes('s') ? 720 : 690,
    };
    const resized = resizeDrawingObject(
      { kind: 'resize', handle, start, object, original: object },
      point
    );
    const bounds = getDrawingSelectionBounds([resized])!;
    expect(bounds.x).toBeGreaterThanOrEqual(100 - 1e-7);
    expect(bounds.y).toBeGreaterThanOrEqual(600 - 1e-7);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(500 + 1e-7);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(900 + 1e-7);
    expect(bounds.width * bounds.height).toBeGreaterThan(80 * 60);
  }
);

it.each([
  [false, false, 0],
  [true, false, 0],
  [false, true, 0],
  [true, true, 0],
  [false, true, 30],
  [true, true, 30],
] as const)(
  'bounds Simplify resize with Ctrl=%s Shift=%s rotation=%s',
  async (ctrlKey, shiftKey, rotation) => {
    const { createDefaultSimplifySettings } = await import('../../features/simplify/settings');
    const { transformDrawingObjectPoint } = await import('../../features/drawing/public');
    const object = {
      id: 'mask',
      kind: 'simplify' as const,
      rotation,
      bounds: { x: 180, y: 660, width: 80, height: 60 },
      settings: createDefaultSimplifySettings(),
      source: {
        dataUrl: 'source',
        width: 500,
        height: 375,
        bounds: { x: 100, y: 600, width: 400, height: 300 },
      },
    };
    const start = transformDrawingObjectPoint(object, { x: 260, y: 720 });
    const resized = resizeDrawingObject(
      { kind: 'resize', handle: 'se', start, object, original: object },
      { x: 2000, y: 2000 },
      { ctrlKey, shiftKey }
    );
    const outer = getDrawingSelectionBounds([resized])!;
    expect(outer.x).toBeGreaterThanOrEqual(100 - 1e-7);
    expect(outer.y).toBeGreaterThanOrEqual(600 - 1e-7);
    expect(outer.x + outer.width).toBeLessThanOrEqual(500 + 1e-7);
    expect(outer.y + outer.height).toBeLessThanOrEqual(900 + 1e-7);
    const local = 'bounds' in resized ? resized.bounds : null;
    expect(local).not.toBeNull();
    if (shiftKey) expect(local!.width / local!.height).toBeCloseTo(4 / 3);
    if (ctrlKey)
      expect(getDrawingBoundsCenter(local!)).toEqual(getDrawingBoundsCenter(object.bounds));
  }
);

it('does not constrain manual Simplify image primitives to a retained source', async () => {
  const { createDefaultSimplifySettings } = await import('../../features/simplify/settings');
  const object = {
    id: 'primitive',
    kind: 'simplify' as const,
    bounds: { x: 180, y: 660, width: 80, height: 60 },
    settings: {
      ...createDefaultSimplifySettings(),
      automatic: false,
      manualKind: 'image' as const,
    },
    source: {
      dataUrl: 'source',
      width: 500,
      height: 375,
      bounds: { x: 100, y: 600, width: 400, height: 300 },
    },
  };
  const resized = resizeDrawingObject(
    { kind: 'resize', handle: 'se', start: { x: 260, y: 720 }, object, original: object },
    { x: 2000, y: 2000 }
  );
  expect(getDrawingSelectionBounds([resized])!.width).toBeGreaterThan(1000);
});

it.each([
  [false, false, 0],
  [true, false, 0],
  [false, true, 0],
  [true, true, 0],
  [false, true, 30],
  [true, true, 30],
] as const)(
  'keeps the canonical anchor after crossing and clamping a handle (Ctrl=%s Shift=%s rotation=%s)',
  async (ctrlKey, shiftKey, rotation) => {
    const { createDefaultSimplifySettings } = await import('../../features/simplify/settings');
    const { transformDrawingObjectPoint } = await import('../../features/drawing/public');
    const object = {
      id: 'flipped-mask',
      kind: 'simplify' as const,
      rotation,
      bounds: { x: 180, y: 660, width: 80, height: 60 },
      settings: createDefaultSimplifySettings(),
      source: {
        dataUrl: 'source',
        width: 500,
        height: 375,
        bounds: { x: 100, y: 600, width: 400, height: 300 },
      },
    };
    const start = transformDrawingObjectPoint(object, { x: 260, y: 690 });
    const point = transformDrawingObjectPoint(object, { x: -1000, y: 690 });
    const resized = resizeDrawingObject(
      { kind: 'resize', handle: 'e', start, object, original: object },
      point,
      { ctrlKey, shiftKey }
    );
    if (resized.kind !== 'simplify') throw new Error('Expected a Simplify mask');
    const b = resized.bounds;
    if (ctrlKey) expect(getDrawingBoundsCenter(b)).toEqual(getDrawingBoundsCenter(object.bounds));
    else {
      const expected = transformDrawingObjectPoint(object, { x: 180, y: 690 });
      const actual = transformDrawingObjectPoint(resized, {
        x: b.x + b.width,
        y: b.y + b.height / 2,
      });
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    }
    const outer = getDrawingSelectionBounds([resized])!;
    expect(outer.x).toBeGreaterThanOrEqual(100 - 1e-7);
    expect(outer.y).toBeGreaterThanOrEqual(600 - 1e-7);
    expect(outer.x + outer.width).toBeLessThanOrEqual(500 + 1e-7);
    expect(outer.y + outer.height).toBeLessThanOrEqual(900 + 1e-7);
  }
);
