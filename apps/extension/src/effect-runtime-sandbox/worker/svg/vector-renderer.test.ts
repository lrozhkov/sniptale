import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { EffectRuntimeWorkerSvgAsset } from '../../../contracts/effect-runtime/types';
import { createPassContext } from '../interpreter/support.test-support';
import { createSvgPartTransform } from './part-transform';
import { clearSvgVectorCache, parseSvgAsset } from './vector-parser';
import { drawSvgVectorAsset } from './vector-renderer';

class FakePath2D {
  constructor(readonly source: string) {}
}

beforeEach(() => {
  vi.stubGlobal('Path2D', FakePath2D);
});

afterEach(() => {
  clearSvgVectorCache();
  vi.unstubAllGlobals();
});

it('hydrates, caches, clears, and rejects serialized vector payloads', () => {
  const asset = createAsset();
  const first = parseSvgAsset(asset);

  expect(first.parts[0]).toMatchObject({ path: expect.any(FakePath2D) });
  expect(parseSvgAsset(asset)).toBe(first);
  clearSvgVectorCache();
  expect(parseSvgAsset(asset)).not.toBe(first);
  expect(() => parseSvgAsset({ id: 'bad', svgVector: null })).toThrow('EFFECT_SVG_PAYLOAD_INVALID');
});

it('renders selected path and rectangle parts with per-part transforms', () => {
  const context = createPassContext();
  const asset = createAsset();

  drawSvgVectorAsset(context, asset, {
    alpha: 0.5,
    composite: 'screen',
    filter: 'blur(1px)',
    height: 40,
    partFilter: () => true,
    partGroups: ['group'],
    partIds: ['path', 'rect'],
    partTransform: (part, index) =>
      index === 0
        ? { alpha: 0, composite: 'lighter' }
        : { filter: 'none', originX: part.cx, originY: part.cy, rotate: 1, scale: 2, x: 3, y: 4 },
    shadowBlur: 2,
    shadowColor: '#000',
    width: 80,
    x: 5,
    y: 6,
  });

  expect(context.fill).toHaveBeenCalledOnce();
  expect(context.stroke).toHaveBeenCalledOnce();
  expect(context.arcTo).toHaveBeenCalledTimes(4);
  expect(context.rotate).toHaveBeenCalledWith(1);
  expect(context.scale).toHaveBeenCalledWith(2, 2);
});

it('renders both part kinds with default sizing, paint, cap, join, and origin behavior', () => {
  const context = createPassContext();
  const asset = createAsset();
  asset.height = 0;
  asset.width = 0;
  asset.svgVector.parts[0]!.strokeLineCap = 'invalid';
  asset.svgVector.parts[0]!.strokeLineJoin = 'invalid';

  drawSvgVectorAsset(context, asset, {
    partTransform: (_part, index) => (index === 0 ? { rotate: 1 } : undefined),
  });

  expect(context.fill).toHaveBeenCalledTimes(2);
  expect(context.stroke).toHaveBeenCalledTimes(2);
  expect(context.lineCap).toBe('square');
  expect(context.lineJoin).toBe('round');
  expect(context.rotate).toHaveBeenCalledWith(1);
});

it('filters unmatched ids, groups, and callbacks without drawing parts', () => {
  const context = createPassContext();
  const asset = createAsset();

  drawSvgVectorAsset(context, asset, { partFilter: () => false });
  drawSvgVectorAsset(context, asset, { partIds: ['missing'] });
  drawSvgVectorAsset(context, asset, { partGroups: ['missing'] });

  expect(context.fill).not.toHaveBeenCalled();
  expect(context.stroke).not.toHaveBeenCalled();
});

it('supports every deterministic preset ordering and scatter mode', () => {
  const parsed = parseSvgAsset(createAsset());
  for (const order of ['document', 'reverse', 'center', 'edges', 'random']) {
    const transform = createSvgPartTransform({
      blur: 3,
      mode: 'scatter',
      order,
      reveal: 0.5,
      spread: 10,
    });
    expect(transform(parsed.parts[0]!, 0, parsed)).toMatchObject({
      alpha: expect.any(Number),
      filter: expect.any(String),
      originX: 5,
      originY: 5,
    });
  }
  const single = { ...parsed, parts: [parsed.parts[0]!] };
  expect(createSvgPartTransform({ mode: 'shatter' })(single.parts[0]!, 0, single)).toMatchObject({
    rotate: expect.any(Number),
    scale: expect.any(Number),
  });
});

function createAsset(): EffectRuntimeWorkerSvgAsset {
  return {
    cacheKey: 'fixture',
    height: 20,
    id: 'logo',
    kind: 'svg',
    mimeType: 'image/svg+xml',
    svgVector: {
      height: 20,
      parts: [
        {
          cx: 5,
          cy: 5,
          fill: '#fff',
          groupId: 'group',
          groupIds: ['group'],
          id: 'path',
          opacity: 1,
          pathData: 'M0 0L10 10',
          stroke: '#000',
          strokeLineCap: 'round',
          strokeLineJoin: 'bevel',
          strokeWidth: 1,
          type: 'path',
        },
        {
          cx: 5,
          cy: 5,
          fill: '#fff',
          groupId: 'group',
          groupIds: ['group'],
          height: 10,
          id: 'rect',
          opacity: 1,
          rx: 2,
          stroke: '#000',
          strokeLineCap: 'square',
          strokeLineJoin: 'round',
          strokeWidth: 1,
          type: 'rect',
          width: 10,
          x: 0,
          y: 0,
        },
      ],
      width: 40,
    },
    width: 40,
  };
}
