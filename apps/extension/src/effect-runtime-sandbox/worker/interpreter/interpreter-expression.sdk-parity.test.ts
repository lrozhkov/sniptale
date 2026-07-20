import { describe, expect, it, vi } from 'vitest';

import type { EffectV1EvaluationScope } from './expression.js';
import { evaluateEffectV1Expression } from './expression.js';
import { createEffectV1GraphRenderer } from './graph-renderer.js';
import {
  createCanvas,
  createDocument,
  createRuntime,
  createSvgAsset,
  createSvgPart,
} from './support.test-support.js';

describe('sandbox Effect v1 inputs and expressions', () => {
  it('draws only a kind-owned runtime input', async () => {
    const source = { close: vi.fn(), height: 100, width: 200 };
    const runtime = createRuntime();
    const document = createDocument([
      { height: 100, input: 'source', op: 'image', width: 200, x: 0, y: 0 },
    ]);
    document.kind = 'targetEffect';

    await render(document, runtime, createCanvas(200, 100, []), { source });

    expect(runtime.drawImageAsset).toHaveBeenCalledWith(
      expect.anything(),
      { bitmap: source },
      expect.objectContaining({ alpha: 1, height: 100, width: 200 })
    );
  });

  it('evaluates bounded numeric, geometry, and string expressions', () => {
    const scope = createExpressionScope();
    const sum = {
      args: [
        { op: 'read', path: 'defs.half' },
        { op: 'read', path: 'vars.offset' },
        { op: 'read', path: 'controls.amplitude' },
      ],
      op: 'add',
    } as const;
    const curve = {
      args: [
        { args: [0, 0], op: 'point' },
        { args: [0, 1], op: 'point' },
        { args: [1, 1], op: 'point' },
        { args: [1, 0], op: 'point' },
        0.5,
      ],
      op: 'cubicPoint',
    } as const;

    expect(evaluateEffectV1Expression(sum, scope)).toBe(656);
    expect(evaluateEffectV1Expression(curve, scope)).toEqual({ x: 0.5, y: 0.75 });
    expect(
      evaluateEffectV1Expression({ args: ['Geometria', ', Arial'], op: 'concat' }, scope)
    ).toBe('Geometria, Arial');
  });
});

describe('sandbox Effect v1 SVG part expressions', () => {
  it('evaluates custom transforms in a bounded part scope', async () => {
    const runtime = createRuntime();
    const document = createSvgDocument();
    const canvas = createCanvas(200, 100, []);
    Object.assign(canvas.getContext('2d')!, {
      __sniptaleLogicalScaleX: 3,
      __sniptaleLogicalScaleY: 3,
    });

    await render(document, runtime, canvas, {}, { logo: createSvgAsset('logo') });

    const args = runtime.drawSvgVectorAsset.mock.calls[0]![2];
    const part = createSvgPart('part', 11);
    expect(args.partTransform!(part, 1, { height: 1, parts: [part, part], width: 1 })).toEqual({
      alpha: 1.5,
      filter: 'blur(6.00px)',
      originX: 11,
      x: 14,
    });
  });
});

function createExpressionScope(): EffectV1EvaluationScope {
  return {
    context: {
      controls: { amplitude: 4 },
      height: 720,
      resolveLayer: vi.fn(() => ({ opacity: 0.75 })),
      track: vi.fn(() => 0.5),
      width: 1280,
    },
    definitions: { half: { args: [{ op: 'read', path: 'width' }, 0.5], op: 'mul' } },
    definitionCache: new Map(),
    vars: { offset: 12 },
  };
}

function createSvgDocument() {
  const document = createDocument([
    {
      alpha: 0.5,
      assetId: 'logo',
      height: 40,
      op: 'svgParts',
      part: {
        alpha: { args: [{ op: 'read', path: 'item.index' }, 0.5], op: 'add' },
        blur: { args: [{ op: 'read', path: 'item.index' }, 2], op: 'mul' },
        kind: 'custom',
        originX: { op: 'read', path: 'item.cx' },
        x: { args: [{ op: 'read', path: 'item.cx' }, 3], op: 'add' },
      },
      width: 100,
      x: 10,
      y: 20,
    },
  ]);
  document.assets = [
    {
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      svgText: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    },
  ];
  return document;
}

async function render(
  document: ReturnType<typeof createDocument>,
  runtime: ReturnType<typeof createRuntime>,
  canvas: ReturnType<typeof createCanvas>,
  inputFrames: Record<string, unknown>,
  assets = {}
) {
  await createEffectV1GraphRenderer(document, runtime).renderFrame({
    assets,
    controls: {},
    createCanvas: () => canvas,
    duration: 2,
    frameIndex: 0,
    height: 100,
    inputFrames,
    progress: 0,
    resolveLayer: vi.fn(),
    time: 0,
    track: vi.fn(),
    width: 200,
  });
}
