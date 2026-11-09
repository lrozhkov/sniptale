import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  validateEffectV1Document,
  type EffectV1Command,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  createEffectRuntimeWorkerExecutionState,
  executeEffectRuntimeWorkerRequest,
} from '../execute';
import { createEffectRuntimeWorkerTestRequest } from '../execute.test-support';
import { createPassContext } from './support.test-support';
import { EffectRuntimeResourceError } from '../resource-policy';
import type { EffectRuntimeGpuPlanResult } from '../../../contracts/effect-runtime/types';

const propertyKeys = [
  'fillStyle',
  'strokeStyle',
  'font',
  'globalAlpha',
  'globalCompositeOperation',
  'filter',
  'lineWidth',
  'lineCap',
  'lineJoin',
  'shadowBlur',
  'shadowColor',
  'shadowOffsetX',
  'shadowOffsetY',
  'textAlign',
  'textBaseline',
] as const;
class Bitmap implements ImageBitmap {
  static all: Bitmap[] = [];
  close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number,
    readonly paints: unknown[] = []
  ) {
    Bitmap.all.push(this);
  }
}
class Canvas {
  static all: Canvas[] = [];
  static failTransfer = 0;
  static transfers = 0;
  paints: unknown[] = [];
  context;
  constructor(
    public width: number,
    public height: number
  ) {
    Canvas.all.push(this);
    let matrix = [1, 0, 0, 1, 0, 0];
    const stack: { matrix: number[]; props: Record<string, unknown> }[] = [];
    const context = Object.assign(createPassContext(), {
      getTransform: () => ({
        a: matrix[0]!,
        b: matrix[1]!,
        c: matrix[2]!,
        d: matrix[3]!,
        e: matrix[4]!,
        f: matrix[5]!,
      }),
      getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255]) }),
    });
    context.save = vi.fn(() =>
      stack.push({
        matrix: [...matrix],
        props: Object.fromEntries(propertyKeys.map((key) => [key, context[key]])),
      })
    );
    context.restore = vi.fn(() => {
      const value = stack.pop();
      if (!value) return;
      matrix = value.matrix;
      Object.assign(context, value.props);
    });
    context.setTransform = vi.fn(
      (
        a: number | DOMMatrix2DInit = {},
        b?: number,
        c?: number,
        d?: number,
        e?: number,
        f?: number
      ) => {
        matrix =
          typeof a === 'number'
            ? [a, b!, c!, d!, e!, f!]
            : [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
      }
    );
    context.translate = vi.fn((x: number, y: number) => {
      matrix[4] = matrix[4]! + matrix[0]! * x + matrix[2]! * y;
      matrix[5] = matrix[5]! + matrix[1]! * x + matrix[3]! * y;
    });
    context.scale = vi.fn((x: number, y: number) => {
      matrix[0] = matrix[0]! * x;
      matrix[1] = matrix[1]! * x;
      matrix[2] = matrix[2]! * y;
      matrix[3] = matrix[3]! * y;
    });
    context.drawImage = vi.fn((source: unknown) => {
      if (source instanceof Canvas) {
        this.paints = [...source.paints];
        return;
      }
      throw new Error('IMAGE_OR_PASS_ENTERED_CANVAS');
    });
    const paint = (kind: string) =>
      this.paints.push({
        kind,
        alpha: context.globalAlpha,
        blend: context.globalCompositeOperation,
        filter: context.filter,
        shadow: context.shadowColor,
      });
    context.fillRect = vi.fn(() => paint('fillRect'));
    context.fill = vi.fn(() => paint('fill'));
    context.stroke = vi.fn(() => paint('stroke'));
    context.fillText = vi.fn(() => paint('text'));
    context.clearRect = vi.fn(() => {
      this.paints = [];
    });
    this.context = context;
  }
  getContext() {
    return this.context;
  }
  transferToImageBitmap() {
    if (++Canvas.transfers === Canvas.failTransfer) throw new EffectRuntimeResourceError();
    const result = new Bitmap(this.width, this.height, this.paints);
    this.paints = [];
    return result;
  }
}
beforeEach(() => {
  Canvas.all = [];
  Bitmap.all = [];
  Canvas.transfers = 0;
  Canvas.failTransfer = 0;
  vi.stubGlobal('OffscreenCanvas', Canvas);
  vi.stubGlobal('ImageBitmap', Bitmap);
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async (bitmap: ImageBitmap) => new Bitmap(bitmap.width, bitmap.height))
  );
});
afterEach(() => vi.unstubAllGlobals());

function request(commands: EffectV1Command[]) {
  const value = createEffectRuntimeWorkerTestRequest();
  value.width = 160;
  value.height = 120;
  value.renderWidth = 80;
  value.renderHeight = 60;
  value.renderTarget = 'gpu-plan';
  value.documentRef.document!.kind = 'targetEffect';
  value.documentRef.document!.program.commands = commands;
  value.inputFrames = { source: { bitmap: new Bitmap(80, 60), width: 80, height: 60 } };
  const valid = validateEffectV1Document(value.documentRef.document, {
    presentationPolicy: 'retained',
  });
  expect(valid.ok, JSON.stringify(valid)).toBe(true);
  return value;
}
async function run(commands: EffectV1Command[]) {
  const input = request(commands);
  const result = await executeEffectRuntimeWorkerRequest(input, {
    createCanvas: (width, height) => new Canvas(width, height),
  });
  expect(result.kind).toBe('gpu-plan');
  if (result.kind !== 'gpu-plan') throw new Error(JSON.stringify(result));
  return { input, plan: result };
}
const image: EffectV1Command = {
  op: 'image',
  input: 'source',
  x: 0,
  y: 0,
  width: 160,
  height: 120,
};
function draws(plan: EffectRuntimeGpuPlanResult) {
  return plan.passes.flatMap((pass) => pass.operations).filter((op) => op.op === 'draw');
}

it('returns original inputs and immutable fresh-state snapshots without Canvas image draws', async () => {
  const { input, plan } = await run([
    {
      op: 'group',
      alpha: 0.5,
      filter: { brightness: 0.5 },
      commands: [
        {
          op: 'forRange',
          count: 2,
          commands: [
            { op: 'renderPass', id: 'p', commands: [image] },
            { op: 'compositePass', passId: 'p', x: 0, y: 0, width: 160, height: 120 },
          ],
        },
      ],
    },
  ]);
  const root = plan.passes.find((pass) => pass.id === plan.rootPass)!;
  expect(root.operations).toHaveLength(2);
  const composite = root.operations.filter((op) => op.op === 'draw');
  expect(composite[0]!.source).not.toEqual(composite[1]!.source);
  expect(composite.every((op) => op.alpha === 0.5 && op.filter.brightness === 1)).toBe(true);
  const sourceDraws = draws(plan).filter((op) => op.source.kind === 'resource');
  expect(sourceDraws.map((op) => op.alpha)).toEqual([1, 1]);
  expect(sourceDraws.map((op) => op.transform[4])).toEqual([40, 40]);
  expect(plan.resources.find((entry) => entry.id === plan.inputResources.source)!.bitmap).toBe(
    input.inputFrames.source!.bitmap
  );
  expect(input.inputFrames.source!.bitmap.close).not.toHaveBeenCalled();
  for (const canvas of Canvas.all) expect(canvas.context.drawImage).not.toHaveBeenCalled();
});

it('keeps every non-over fill and stroke as a raw operand with separate alpha, filter and shadow', async () => {
  const { plan } = await run([
    image,
    {
      op: 'shape',
      shape: 'rect',
      x: -20,
      y: 0,
      width: 100,
      height: 80,
      fill: '#ff0000',
      stroke: '#ffffff',
      alpha: 0.5,
      blend: 'screen',
      filter: { blur: 2, brightness: 0.8, saturate: 0.6 },
      shadow: { color: '#ff0000', blur: 3, x: 5, y: 7 },
    },
  ]);
  const operations = draws(plan).filter(
    (op) => plan.resources.find((entry) => entry.id === op.source.id)?.kind === 'primitive'
  );
  expect(operations).toHaveLength(2);
  for (const operation of operations) {
    expect(operation).toMatchObject({
      alpha: 0.5,
      blend: 'screen',
      filter: { blur: 1, brightness: 0.8, saturate: 0.6 },
      shadow: { color: [1, 0, 0, 1], blur: 1.5, offsetX: 2.5, offsetY: 3.5 },
    });
    expect(operation.destination.x).toBeLessThan(-10);
    const bitmap = plan.resources.find((entry) => entry.id === operation.source.id)!
      .bitmap as Bitmap;
    expect(bitmap.paints).toEqual([
      expect.objectContaining({
        alpha: 1,
        blend: 'source-over',
        filter: 'none',
        shadow: 'transparent',
      }),
    ]);
  }
  expect(
    (plan.resources.find((entry) => entry.id === operations[0]!.source.id)!.bitmap as Bitmap).paints
  ).toEqual([expect.objectContaining({ kind: 'fill' })]);
});

it('preserves clip-aware clear independently of alpha, filters and blend', async () => {
  const { plan } = await run([
    {
      op: 'clip',
      x: 10,
      y: 12,
      width: 100,
      height: 80,
      commands: [
        image,
        {
          op: 'group',
          alpha: 0.25,
          blend: 'destination-in',
          filter: { blur: 3 },
          commands: [{ op: 'clear', color: '#ffffff' }],
        },
      ],
    },
  ]);
  const operations = plan.passes.find((pass) => pass.id === plan.rootPass)!.operations;
  const clear = operations.find((op) => op.op === 'clear')!;
  expect(clear).toEqual({ op: 'clear', coverage: expect.any(Number) });
  const colored = operations.at(-1)!;
  expect(colored).toMatchObject({
    op: 'draw',
    alpha: 0.25,
    blend: 'destination-in',
    filter: { blur: 1.5 },
  });
  expect(plan.resources.some((entry) => entry.kind === 'coverage')).toBe(true);
});

it('does not add the core per-call 512-layer limit to interpreted scalar commands', async () => {
  const { plan } = await run(Array.from({ length: 513 }, () => ({ ...image })));
  expect(plan.passes[0]!.operations).toHaveLength(513);
  expect(plan.resources).toHaveLength(1);
});

it('does not charge immutable primitive operands as live Canvas surfaces or decoded asset entries', async () => {
  const { plan } = await run([
    image,
    ...Array.from({ length: 80 }, () => ({
      op: 'fillRect' as const,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fill: '#ffffff',
    })),
  ]);
  expect(plan.resources.filter((resource) => resource.kind === 'primitive')).toHaveLength(80);
  expect(plan.passes[plan.rootPass]!.operations).toHaveLength(81);
});

it('admits 100 small shapes at 720p without retaining100full-frame bitmaps', async () => {
  const input = request([
    image,
    ...Array.from({ length: 100 }, () => ({
      op: 'shape' as const,
      shape: 'rect' as const,
      x: 20,
      y: 30,
      width: 10,
      height: 10,
      fill: '#fff',
    })),
  ]);
  input.width = input.renderWidth = 1280;
  input.height = input.renderHeight = 720;
  input.inputFrames = { source: { bitmap: new Bitmap(1280, 720), width: 1280, height: 720 } };
  const result = await executeEffectRuntimeWorkerRequest(input, {
    createCanvas: (w, h) => new Canvas(w, h),
  });
  expect(result.kind).toBe('gpu-plan');
  if (result.kind !== 'gpu-plan') return;
  const primitives = result.resources.filter((resource) => resource.kind === 'primitive');
  expect(primitives).toHaveLength(100);
  expect(
    primitives.reduce((sum, resource) => sum + resource.width * resource.height * 4, 0)
  ).toBeLessThan(100_000);
});

it.each(['fillRect', 'polyline', 'path', 'sampledPath', 'text'] as const)(
  'admits 100 small %s paints at 720p',
  async (kind) => {
    const command: EffectV1Command =
      kind === 'fillRect'
        ? { op: kind, x: 5, y: 5, width: 10, height: 10, fill: '#fff' }
        : kind === 'polyline'
          ? {
              op: kind,
              points: [
                { x: 5, y: 5 },
                { x: 15, y: 15 },
              ],
              stroke: '#fff',
            }
          : kind === 'path'
            ? {
                op: kind,
                segments: [
                  { kind: 'moveTo', x: 5, y: 5 },
                  { kind: 'cubicTo', cp1x: 5, cp1y: 15, cp2x: 15, cp2y: 5, x: 15, y: 15 },
                ],
                stroke: '#fff',
              }
            : kind === 'sampledPath'
              ? { op: kind, from: 0, to: 1, samples: 3, x: 5, y: 5, stroke: '#fff' }
              : { op: kind, text: 'small', x: 5, y: 15, fontSize: 10, fill: '#fff' };
    const input = request([image, ...Array.from({ length: 100 }, () => command)]);
    input.width = input.renderWidth = 1280;
    input.height = input.renderHeight = 720;
    input.inputFrames = { source: { bitmap: new Bitmap(1280, 720), width: 1280, height: 720 } };
    const result = await executeEffectRuntimeWorkerRequest(input, {
      createCanvas: (w, h) => new Canvas(w, h),
    });
    expect(result.kind).toBe('gpu-plan');
    if (result.kind !== 'gpu-plan') return;
    expect(result.resources.filter((r) => r.kind === 'primitive')).toHaveLength(100);
  }
);

it('retains destructive outside and zero-path paints while keeping zero-fillRect a native no-op', async () => {
  const { plan } = await run([
    image,
    { op: 'fillRect', x: 0, y: 0, width: 0, height: 10, fill: '#fff', blend: 'destination-in' },
    {
      op: 'shape',
      shape: 'rect',
      x: 1000,
      y: 1000,
      width: 10,
      height: 10,
      fill: '#fff',
      blend: 'destination-in',
    },
    {
      op: 'path',
      segments: [{ kind: 'moveTo', x: 0, y: 0 }],
      fill: '#fff',
      blend: 'destination-in',
    },
  ]);
  const primitives = draws(plan).filter(
    (op) => plan.resources.find((r) => r.id === op.source.id)?.kind === 'primitive'
  );
  expect(primitives).toHaveLength(2);
  expect(primitives[0]).toMatchObject({
    blend: 'destination-in',
    sourceRect: { width: 1, height: 1 },
  });
  expect(primitives[1]).toMatchObject({ blend: 'destination-in' });
});

it('admits 100 small SVG paths at 720p without using their misleading centroid as bounds', async () => {
  vi.stubGlobal('Path2D', class {});
  const input = request([image]);
  input.width = input.renderWidth = 1280;
  input.height = input.renderHeight = 720;
  input.inputFrames = { source: { bitmap: new Bitmap(1280, 720), width: 1280, height: 720 } };
  input.documentRef.document!.assets = [
    {
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      byteLength: 1,
      sha256: 'b'.repeat(64),
      path: 'runtime-assets/logo.svg',
      width: 1280,
      height: 720,
    },
  ];
  input.documentRef.document!.program.commands.push({
    op: 'svgParts',
    assetId: 'logo',
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  });
  input.assetSelectionRef.assets = {
    logo: {
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      cacheKey: 'b'.repeat(64),
      width: 1280,
      height: 720,
      svgVector: {
        width: 1280,
        height: 720,
        parts: Array.from({ length: 100 }, (_, i) => ({
          id: `p${i}`,
          type: 'path' as const,
          pathData: 'M0 0L10 0L10 10L0 10Z',
          cx: 61.5,
          cy: 18,
          fill: '#fff',
          stroke: null,
          strokeWidth: 1,
          strokeLineCap: 'butt',
          strokeLineJoin: 'miter',
          opacity: 1,
          groupId: null,
          groupIds: [],
        })),
      },
    },
  };
  const result = await executeEffectRuntimeWorkerRequest(input, {
    createCanvas: (w, h) => new Canvas(w, h),
  });
  expect(result.kind).toBe('gpu-plan');
  if (result.kind !== 'gpu-plan') return;
  expect(result.resources.filter((resource) => resource.kind === 'primitive')).toHaveLength(100);
  expect(input.assetSelectionRef.assets['logo']).not.toHaveProperty('bounds');
});

it('reuses an unchanged pass snapshot for repeated composites', async () => {
  const { plan } = await run([
    { op: 'renderPass', id: 'p', commands: [image] },
    ...Array.from({ length: 513 }, () => ({
      op: 'compositePass' as const,
      passId: 'p',
      x: 0,
      y: 0,
    })),
  ]);
  expect(plan.passes).toHaveLength(2);
  const root = plan.passes[plan.rootPass]!;
  expect(root.operations).toHaveLength(513);
  const references = root.operations.map((op) => (op.op === 'draw' ? op.source.id : null));
  expect(new Set(references).size).toBe(1);
});

it('keeps text reveal coverage separate from the raw glyph and its unmasked caret', async () => {
  const { plan } = await run([
    image,
    {
      op: 'text',
      text: 'Hello',
      x: 10,
      y: 30,
      fontSize: 20,
      reveal: 0.5,
      caret: true,
      fill: '#ffffff',
      alpha: 0.5,
    },
  ]);
  const primitives = draws(plan).filter(
    (op) => plan.resources.find((resource) => resource.id === op.source.id)?.kind === 'primitive'
  );
  expect(primitives).toHaveLength(2);
  expect(primitives[0]).toMatchObject({ alpha: 0.5, coverage: expect.any(Number) });
  expect(primitives[1]).toMatchObject({ alpha: 0.41 });
  expect(primitives[1]).not.toHaveProperty('coverage');
  const raw = plan.resources.find((resource) => resource.id === primitives[0]!.source.id)!
    .bitmap as Bitmap;
  expect(raw.paints).toEqual([expect.objectContaining({ kind: 'text', alpha: 1, filter: 'none' })]);
});

it('allocates SVG padding after each part filter and keeps fill and stroke separate', async () => {
  vi.stubGlobal('Path2D', class {});
  const input = request([image]);
  input.documentRef.document!.assets = [
    {
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      byteLength: 1,
      sha256: 'b'.repeat(64),
      path: 'runtime-assets/logo.svg',
      width: 40,
      height: 20,
    },
  ];
  input.documentRef.document!.program.commands.push({
    op: 'svgParts',
    assetId: 'logo',
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    blend: 'screen',
    part: { kind: 'custom', blur: 12 },
  });
  input.assetSelectionRef.assets = {
    logo: {
      id: 'logo',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      cacheKey: 'b'.repeat(64),
      width: 40,
      height: 20,
      svgVector: {
        width: 40,
        height: 20,
        parts: [
          {
            id: 'rect',
            type: 'rect',
            x: 0,
            y: 0,
            width: 40,
            height: 20,
            rx: 0,
            cx: 20,
            cy: 10,
            fill: '#fff',
            stroke: '#000',
            strokeWidth: 1,
            strokeLineCap: 'butt',
            strokeLineJoin: 'miter',
            opacity: 1,
            groupId: null,
            groupIds: [],
          },
        ],
      },
    },
  };
  const plan = await executeEffectRuntimeWorkerRequest(input, {
    createCanvas: (width, height) => new Canvas(width, height),
  });
  expect(plan.kind).toBe('gpu-plan');
  if (plan.kind !== 'gpu-plan') throw new Error(JSON.stringify(plan));
  const primitives = draws(plan).filter(
    (op) => plan.resources.find((resource) => resource.id === op.source.id)?.kind === 'primitive'
  );
  expect(primitives).toHaveLength(2);
  for (const operation of primitives) {
    expect(operation.blend).toBe('screen');
    expect(operation.filter.blur).toBeGreaterThan(0);
    expect(-operation.destination.x).toBeGreaterThanOrEqual(6 * operation.filter.blur);
    const raw = plan.resources.find((resource) => resource.id === operation.source.id)!
      .bitmap as Bitmap;
    expect(raw.paints).toEqual([
      expect.objectContaining({ alpha: 1, filter: 'none', shadow: 'transparent' }),
    ]);
  }
});

it('closes original inputs and partial primitive resources when finalization cannot complete', async () => {
  Canvas.failTransfer = 2;
  const input = request([
    image,
    {
      op: 'shape',
      shape: 'rect',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
      fill: '#ff0000',
      stroke: '#ffffff',
    },
  ]);
  const result = await executeEffectRuntimeWorkerRequest(input, {
    createCanvas: (width, height) => new Canvas(width, height),
  });
  expect(result).toMatchObject({ kind: 'error', code: 'resourceLimit' });
  expect(Bitmap.all).toHaveLength(2);
  for (const bitmap of Bitmap.all) expect(bitmap.close).toHaveBeenCalledOnce();
});

it('clones cached image assets while returning original inputs and keeping the cache alive', async () => {
  const state = createEffectRuntimeWorkerExecutionState({
    createCanvas: (width, height) => new Canvas(width, height),
  });
  const input = request([image]);
  const original = new Bitmap(12, 10);
  input.documentRef.document!.assets = [
    {
      id: 'logo',
      kind: 'image',
      mimeType: 'image/png',
      byteLength: 1,
      sha256: 'a'.repeat(64),
      path: 'runtime-assets/logo.png',
    },
  ];
  input.documentRef.document!.program.commands.push({
    op: 'image',
    assetId: 'logo',
    x: 4,
    y: 8,
    width: 12,
    height: 10,
  });
  input.assetSelectionRef.assets = {
    logo: {
      id: 'logo',
      kind: 'image',
      mimeType: 'image/png',
      cacheKey: 'a'.repeat(64),
      bitmap: original,
      width: 12,
      height: 10,
    },
  };
  const first = await state.execute(input);
  expect(first.kind).toBe('gpu-plan');
  if (first.kind !== 'gpu-plan') throw new Error(JSON.stringify(first));
  expect(first.resources.find((resource) => resource.kind === 'asset-clone')!.bitmap).not.toBe(
    original
  );
  expect(createImageBitmap).toHaveBeenCalledWith(original);
  expect(original.close).not.toHaveBeenCalled();
  for (const resource of first.resources) resource.bitmap.close();
  const second = await state.execute({
    ...input,
    documentRef: { id: input.documentRef.id },
    assetSelectionRef: { id: input.assetSelectionRef.id },
    requestId: 'next',
    sequenceId: 2,
    inputFrames: { source: { bitmap: new Bitmap(80, 60), width: 80, height: 60 } },
  });
  expect(second.kind).toBe('gpu-plan');
  expect(createImageBitmap).toHaveBeenCalledTimes(2);
  expect(original.close).not.toHaveBeenCalled();
  state.dispose();
  expect(original.close).toHaveBeenCalledOnce();
});

it('closes the flat returned input table after a failed worker post even with a long operation graph', async () => {
  vi.resetModules();
  const scope: {
    onmessage: ((event: MessageEvent) => void) | null;
    postMessage: ReturnType<typeof vi.fn>;
  } = {
    onmessage: null,
    postMessage: vi.fn(() => {
      throw new Error('Transfer failed');
    }),
  };
  vi.stubGlobal('self', scope);
  await import('../index');
  const input = request(Array.from({ length: 513 }, () => ({ ...image })));
  const source = input.inputFrames.source!.bitmap;
  scope.onmessage!(new MessageEvent('message', { data: input }));
  await vi.waitFor(() => expect(source.close).toHaveBeenCalledOnce());
  expect(scope.postMessage.mock.calls[0]![0].result).toMatchObject({ kind: 'gpu-plan' });
});
