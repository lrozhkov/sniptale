import { expect, it, vi } from 'vitest';

import type { EffectV1Command, EffectV1ExpressionOp } from '@sniptale/runtime-contracts/effect-v1';

import { evaluateEffectV1Expression, readEffectV1Value } from './expression';
import { evaluateEffectV1Operation } from './expression-operations';
import { createEffectV1GraphRenderer } from './graph-renderer';
import {
  createCanvas,
  createDocument,
  createRuntime,
  createSvgAsset,
  createSvgPart,
} from './support.test-support';

class FakeBitmap implements ImageBitmap {
  readonly height = 1;
  readonly width = 1;
  close(): void {}
}

it('evaluates the complete bounded expression operation table', () => {
  const cases: Array<[EffectV1ExpressionOp, unknown[], unknown]> = [
    ['add', [1, 2], 3],
    ['sub', [4, 3], 1],
    ['mul', [2, 3], 6],
    ['div', [4, 0], 0],
    ['neg', [2], -2],
    ['min', [2, 1], 1],
    ['max', [2, 1], 2],
    ['clamp', [4, 0, 2], 2],
    ['abs', [-2], 2],
    ['floor', [2.8], 2],
    ['pow', [2, 3], 8],
    ['sqrt', [-1], 0],
    ['exp', [1], Math.E],
    ['mod', [-1, 4], 3],
    ['mix', [0, 10, 0.5], 5],
    ['sin', [0], 0],
    ['cos', [0], 1],
    ['out', [0.5], 0.875],
    ['inOut', [0.25], 0.0625],
    ['eq', [1, 1], true],
    ['lt', [1, 2], true],
    ['lte', [1, 1], true],
    ['gt', [2, 1], true],
    ['gte', [2, 2], true],
    ['and', [true, 1], true],
    ['or', [false, 1], true],
    ['not', [false], true],
    ['concat', ['a', 1], 'a1'],
    ['point', [1, 2], { x: 1, y: 2 }],
    ['rgba', [300, -1, 20, 2], 'rgba(255, 0, 20, 1)'],
    ['ellipsePoint', [1, 2, 3, 4, 0], { x: 4, y: 2 }],
    ['ellipseVelocity', [1, 2, 3, 4, 0], { x: -0, y: 4 }],
  ];

  for (const [operation, values, expected] of cases) {
    expect(evaluateEffectV1Operation(operation, values)).toEqual(expected);
  }
  const curve = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, 0.5];
  expect(evaluateEffectV1Operation('cubicPoint', curve)).toEqual({ x: 0.5, y: 0.75 });
  expect(evaluateEffectV1Operation('cubicTangent', curve)).toEqual({ x: 1.5, y: 0 });
});

it('reads every declarative scope namespace with fallback and selection semantics', () => {
  const bitmap = new FakeBitmap();
  const scope = {
    context: {
      controls: { amount: 2 },
      duration: 3,
      frameIndex: 4,
      height: 5,
      inputFrames: { source: bitmap },
      progress: 0.5,
      resolveLayer: vi.fn(() => ({ nested: { x: 6 } })),
      time: 1,
      track: vi.fn(() => 7),
      width: 8,
    },
    definitions: { answer: { args: [40, 2], op: 'add' as const } },
    definitionCache: new Map<string, unknown>(),
    item: { value: 9 },
    vars: { nested: { value: 10 } },
  };

  expect(
    ['time', 'progress', 'width', 'height', 'frameIndex', 'duration'].map((path) =>
      readEffectV1Value(path, scope)
    )
  ).toEqual([1, 0.5, 8, 5, 4, 3]);
  expect(readEffectV1Value('controls.amount', scope)).toBe(2);
  expect(readEffectV1Value('tracks.card.x', scope)).toBe(7);
  expect(readEffectV1Value('layers.card.nested.x', scope)).toBe(6);
  expect(readEffectV1Value('vars.nested.value', scope)).toBe(10);
  expect(readEffectV1Value('item.value', scope)).toBe(9);
  expect(readEffectV1Value('defs.answer', scope)).toBe(42);
  expect(readEffectV1Value('defs.answer', scope)).toBe(42);
  expect(readEffectV1Value('input.source', scope)).toBe(bitmap);
  expect(readEffectV1Value('input.unknown', scope)).toBeUndefined();
  expect(evaluateEffectV1Expression({ fallback: 11, op: 'fallback', value: null }, scope)).toBe(11);
  expect(evaluateEffectV1Expression({ op: 'select', value: false, values: [1, 2] }, scope)).toBe(2);
  expect(evaluateEffectV1Expression([], scope)).toBeNull();
});

it('executes bounded loops, drawing variants, clipping, passes, and SVG dispatch', async () => {
  const operations: string[] = [];
  const runtime = createRuntime();
  const document = createDocument(COMMAND_SURFACE);
  document.assets = [{ id: 'logo', kind: 'svg', mimeType: 'image/svg+xml', svgText: '<svg/>' }];
  document.layers = [{ id: 'hidden', type: 'customDraw' }];
  const canvas = createCanvas(320, 180, operations);

  await createEffectV1GraphRenderer(document, runtime).renderFrame({
    assets: { logo: createSvgAsset('logo') },
    controls: {},
    createCanvas: () => canvas,
    duration: 2,
    frameIndex: 0,
    height: 180,
    inputFrames: {},
    progress: 0.5,
    resolveLayer: vi.fn((id) => ({ active: id !== 'hidden', opacity: 1, x: 1, y: 2 })),
    time: 1,
    track: vi.fn(),
    width: 320,
  });

  expect(operations).toEqual(
    expect.arrayContaining([
      'arc',
      'ellipse',
      'rect',
      'roundRect',
      'quadraticCurveTo',
      'bezierCurveTo',
      'clip',
      'fillText',
    ])
  );
  expect(operations.filter((operation) => operation === 'fillRect').length).toBeGreaterThan(10);
  expect(runtime.drawSvgVectorAsset).toHaveBeenCalledTimes(3);
  const transform = runtime.drawSvgVectorAsset.mock.calls[2]![2].partTransform!;
  const part = createSvgPart('part', 1);
  expect(transform(part, 0, { height: 1, parts: [part], width: 1 })).toMatchObject({
    filter: 'none',
    originY: 2,
    rotate: 3,
    scale: 1,
    y: 5,
  });
});

const LOOP_BODY: EffectV1Command[] = [
  { fill: '#fff', height: 1, op: 'fillRect', width: 1, x: 0, y: 0 },
];

const COMMAND_SURFACE: EffectV1Command[] = [
  { op: 'clear' },
  { color: '#000', op: 'clear' },
  { fill: '#fff', height: 10, op: 'shape', shape: 'circle', width: 10, x: 0, y: 0 },
  { fill: '#fff', height: 10, op: 'shape', shape: 'ellipse', width: 10, x: 0, y: 0 },
  { fill: '#fff', height: 10, op: 'shape', shape: 'diamond', width: 10, x: 0, y: 0 },
  { fill: '#fff', height: 10, op: 'shape', shape: 'rect', width: 10, x: 0, y: 0 },
  {
    caret: true,
    fill: '#fff',
    fontSize: 12,
    maxWidth: 20,
    op: 'text',
    reveal: 0.5,
    text: 'Text',
    x: 0,
    y: 10,
  },
  { fill: '#fff', fontSize: 12, op: 'text', text: 'Full', x: 0, y: 10 },
  { height: 1, input: 'source', op: 'image', width: 1, x: 0, y: 0 },
  {
    closed: true,
    fill: '#fff',
    op: 'path',
    segments: [
      { kind: 'moveTo', x: 0, y: 0 },
      { kind: 'lineTo', x: 1, y: 1 },
      { cpx: 1, cpy: 1, kind: 'quadraticTo', x: 2, y: 2 },
      { cp1x: 1, cp1y: 1, cp2x: 2, cp2y: 2, kind: 'cubicTo', x: 3, y: 3 },
      { centerX: 2, centerY: 2, end: 1, kind: 'arc', radius: 1, start: 0 },
      {
        centerX: 2,
        centerY: 2,
        end: 1,
        kind: 'ellipse',
        radiusX: 2,
        radiusY: 1,
        rotation: 0,
        start: 0,
      },
      { height: 2, kind: 'rect', width: 2, x: 0, y: 0 },
      { height: 2, kind: 'roundRect', radius: 1, width: 2, x: 0, y: 0 },
    ],
  },
  {
    op: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    progress: 0,
    stroke: '#fff',
  },
  {
    op: 'polyline',
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    progress: 0.5,
    stroke: '#fff',
  },
  { commands: LOOP_BODY, items: [2, 1], itemVar: 'item', op: 'forEach' },
  { commands: LOOP_BODY, count: 2, indexVar: 'i', op: 'forRange' },
  { columns: 2, columnVar: 'column', commands: LOOP_BODY, op: 'forGrid', rows: 2, rowVar: 'row' },
  {
    commands: LOOP_BODY,
    direction: 'desc',
    itemVar: 'item',
    items: [2, 1],
    key: { op: 'read', path: 'item' },
    op: 'stableOrderBy',
  },
  { commands: LOOP_BODY, condition: false, op: 'when' },
  { commands: LOOP_BODY, condition: true, op: 'when' },
  { bindings: { x: 1 }, commands: LOOP_BODY, op: 'let' },
  { commands: LOOP_BODY, height: 10, op: 'clip', width: 10, x: 0, y: 0 },
  { commands: LOOP_BODY, height: 10, id: 'pass', op: 'renderPass', width: 10 },
  { filter: { blur: 1, brightness: 2, saturate: 0.5 }, op: 'compositePass', passId: 'pass' },
  { op: 'compositePass', passId: 'missing' },
  { assetId: 'logo', height: 10, op: 'svgParts', width: 10, x: 0, y: 0 },
  {
    assetId: 'logo',
    height: 10,
    op: 'svgParts',
    part: { kind: 'preset', mode: 'scatter' },
    width: 10,
    x: 0,
    y: 0,
  },
  {
    assetId: 'logo',
    height: 10,
    op: 'svgParts',
    part: {
      alpha: 1,
      blur: 0,
      kind: 'custom',
      originX: 1,
      originY: 2,
      rotate: 3,
      scale: 1,
      x: 4,
      y: 5,
    },
    width: 10,
    x: 0,
    y: 0,
  },
  { fill: '#fff', height: 1, layerId: 'hidden', op: 'fillRect', width: 1, x: 0, y: 0 },
];
