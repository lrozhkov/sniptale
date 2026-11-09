import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { EffectRuntimeGpuPass } from '../../../../../contracts/effect-runtime/gpu-plan';
import { EFFECT_SVG_VECTOR_LIMITS } from '../../../../../contracts/effect-runtime/svg-vector';
import { EFFECT_V1_GRAPH_LIMITS } from '@sniptale/runtime-contracts/effect-v1';
import { EFFECT_RUNTIME_RESOURCE_LIMITS } from './resource-limits';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeGpuPlanResult,
  type EffectRuntimeWorkerMessage,
} from '../../../../../contracts/effect-runtime/types';
import {
  fitsEffectRuntimeGpuSceneTransport,
  parseEffectRuntimeGpuScenePlan,
  parseEffectRuntimeGpuPlan,
} from './gpu-plan-boundary';

class Bitmap implements ImageBitmap {
  close = vi.fn();
  constructor(
    readonly width = 10,
    readonly height = 10
  ) {}
}
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => vi.unstubAllGlobals());
function request(): EffectRuntimeWorkerMessage {
  return {
    renderTarget: 'gpu-plan',
    assetSelectionRef: { id: 'a'.repeat(64) },
    documentRef: { id: 'b'.repeat(64) },
    controls: {},
    duration: 1,
    fps: 30,
    frameIndex: 0,
    height: 10,
    width: 10,
    renderHeight: 10,
    renderWidth: 10,
    inputFrames: { source: { bitmap: new Bitmap(0, 0), width: 10, height: 10 } },
    progress: 0,
    time: 0,
    effectInstanceId: 'effect',
    requestId: 'request',
    snapshotId: 'snapshot',
    sequenceId: 1,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
  };
}
function plan(): EffectRuntimeGpuPlanResult {
  const r = request();
  return {
    kind: 'gpu-plan',
    effectInstanceId: r.effectInstanceId,
    requestId: r.requestId,
    snapshotId: r.snapshotId,
    sequenceId: r.sequenceId,
    acknowledged: { assetSelectionId: r.assetSelectionRef.id, documentId: r.documentRef.id },
    width: 10,
    height: 10,
    logicalWidth: 10,
    logicalHeight: 10,
    resources: [{ id: 0, kind: 'input', bitmap: new Bitmap(), width: 10, height: 10 }],
    inputResources: { source: 0 },
    rootPass: 0,
    passes: [
      {
        id: 0,
        width: 10,
        height: 10,
        logicalWidth: 10,
        logicalHeight: 10,
        operations: [
          {
            op: 'draw',
            source: { kind: 'resource', id: 0 },
            sourceRect: { x: 0, y: 0, width: 10, height: 10 },
            destination: { x: 0, y: 0, width: 10, height: 10 },
            transform: [1, 0, 0, 1, 0, 0],
            alpha: 1,
            blend: 'source-over',
            filter: { blur: 0, brightness: 1, saturate: 1 },
            shadow: { color: [0, 0, 0, 0], blur: 0, offsetX: 0, offsetY: 0 },
          },
        ],
      },
    ],
  };
}
it('keeps neutral resources borrowed and validates detached request metadata', () => {
  const p = plan();
  expect(parseEffectRuntimeGpuPlan(p, request())).toEqual(p);
  expect(p.resources[0]!.bitmap.close).not.toHaveBeenCalled();
});
it.each([
  'identity',
  'ack',
  'dimensions',
  'logical',
  'default',
  'unknown',
  'enum',
  'function',
  'nonfinite',
  'alias',
  'reference',
  'cycle',
  'coverage',
  'input',
  'missing-input',
  'bitmap-size',
])('rejects %s before ownership transfer', (variant) => {
  const p = plan();
  const r = request();
  const draw = p.passes[0]!.operations[0]!;
  if (draw.op !== 'draw') throw Error();
  const malformed: Record<string, unknown> = { ...p };
  switch (variant) {
    case 'identity':
      p.requestId = 'other';
      break;
    case 'ack':
      p.acknowledged.documentId = 'bad';
      break;
    case 'dimensions':
      p.width = 11;
      break;
    case 'logical':
      p.logicalWidth = 11;
      break;
    case 'default':
      delete r.renderTarget;
      break;
    case 'unknown':
      malformed['coverageBaked'] = false;
      break;
    case 'enum':
      malformed['resources'] = [{ ...p.resources[0], kind: 'expression' }];
      break;
    case 'function':
      malformed['passes'] = [{ ...p.passes[0], operations: [() => 1] }];
      break;
    case 'nonfinite':
      draw.alpha = Infinity;
      break;
    case 'alias':
      p.resources.push({ ...p.resources[0]!, id: 1 });
      break;
    case 'reference':
      draw.source.id = 42;
      break;
    case 'cycle':
      draw.source = { kind: 'pass', id: 0 };
      break;
    case 'coverage':
      draw.coverage = 0;
      break;
    case 'input':
      r.inputFrames.source!.width = 11;
      break;
    case 'missing-input':
      p.inputResources = {};
      break;
    case 'bitmap-size':
      p.resources[0]!.width = 11;
      break;
  }
  expect(
    parseEffectRuntimeGpuPlan(
      variant === 'unknown' || variant === 'enum' || variant === 'function' ? malformed : p,
      r
    )
  ).toBeNull();
});
it('accepts earlier immutable passes, fractional logical sizes and finite normalized Canvas rectangles', () => {
  const p = plan();
  const previous = p.passes[0]!;
  const firstDraw = previous.operations[0]!;
  if (firstDraw.op !== 'draw') throw Error();
  p.passes = [
    { ...previous, logicalWidth: 0.5 },
    { ...previous, id: 1, operations: [{ ...firstDraw, source: { kind: 'pass', id: 0 } }] },
  ];
  p.rootPass = 1;
  const d = previous.operations[0]!;
  if (d.op === 'draw') {
    d.destination.width = -5;
    d.sourceRect.height = 0;
  }
  expect(parseEffectRuntimeGpuPlan(p, request())).not.toBeNull();
});
it('bounds graph operations, depth, resource entries and aggregate raster allocation', () => {
  const p = plan();
  const nativePaints =
    EFFECT_V1_GRAPH_LIMITS.expandedCommands * 2 * EFFECT_SVG_VECTOR_LIMITS.maxParts;
  p.passes[0]!.operations = Array(nativePaints + 1);
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.passes[0]!.operations = [];
  p.resources = Array(
    nativePaints +
      EFFECT_V1_GRAPH_LIMITS.expandedCommands +
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterEntries +
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxInputFrames +
      2
  );
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.resources = Array.from({ length: 5 }, (_, id) => ({
    id,
    kind: id === 0 ? ('input' as const) : ('primitive' as const),
    bitmap: new Bitmap(3840, 2160),
    width: 3840,
    height: 2160,
  }));
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
});
it('rejects forward references, duplicate pass IDs, excessive depth and noncoverage masks', () => {
  const p = plan();
  const initial = p.passes[0]!;
  const draw = initial.operations[0]!;
  if (draw.op !== 'draw') throw Error();
  const passes: EffectRuntimeGpuPass[] = Array.from(
    { length: EFFECT_V1_GRAPH_LIMITS.graphDepth + 1 },
    (_, index) => ({
      ...initial,
      id: index,
      operations: index === 0 ? [] : [{ ...draw, source: { kind: 'pass', id: index - 1 } }],
    })
  );
  p.passes = passes;
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.passes = [
    { ...initial, operations: [{ ...draw, source: { kind: 'pass', id: 1 } }] },
    { ...initial, id: 1, operations: [] },
  ];
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.passes = [
    { ...initial, operations: [] },
    { ...initial, operations: [] },
  ];
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.resources.push({ id: 1, kind: 'coverage', bitmap: new Bitmap(9, 10), width: 9, height: 10 });
  p.passes = [{ ...initial, operations: [{ op: 'clear', coverage: 1 }] }];
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
});
it('permits shared input resources for names with identical immutable dimensions', () => {
  const p = plan();
  const r = request();
  r.inputFrames.from = r.inputFrames.source!;
  p.inputResources.from = 0;
  expect(parseEffectRuntimeGpuPlan(p, r)).not.toBeNull();
});
it.each(['blend', 'source', 'filter', 'shadow', 'rect', 'transform', 'op'])(
  'rejects unknown or nonfinite evaluated %s data',
  (field) => {
    const p = plan();
    const draw = p.passes[0]!.operations[0]!;
    if (draw.op !== 'draw') throw Error();
    const changes: Record<string, unknown> = {
      blend: 'overlay',
      source: { kind: 'expression', id: 0 },
      filter: { ...draw.filter, css: 'url(x)' },
      shadow: { ...draw.shadow, color: [0, 0, NaN, 1] },
      rect: { ...draw.destination, width: () => 1 },
      transform: [1, 0, 0, 1, 0, Infinity],
      op: 'evaluate',
    };
    p.passes[0]!.operations = [];
    const malformed = {
      ...p,
      passes: [
        {
          ...p.passes[0],
          operations: [{ ...draw, [field === 'rect' ? 'destination' : field]: changes[field] }],
        },
      ],
    };
    expect(parseEffectRuntimeGpuPlan(malformed, request())).toBeNull();
  }
);

it('admits 256 distinct native paints independently of asset-cache and live-canvas caps', () => {
  const p = plan();
  const initial = p.passes[0]!.operations[0]!;
  if (initial.op !== 'draw') throw Error();
  p.resources.push(
    ...Array.from({ length: 256 }, (_, index) => ({
      id: index + 1,
      kind: 'primitive' as const,
      bitmap: new Bitmap(1, 1),
      width: 1,
      height: 1,
    }))
  );
  p.passes[0]!.operations = p.resources
    .filter((resource) => resource.kind === 'primitive')
    .map((resource) => ({ ...initial, source: { kind: 'resource', id: resource.id } }));
  expect(parseEffectRuntimeGpuPlan(p, request())).not.toBeNull();
});
it('rejects repeated primitive operands and bounds shared scalar operations at canonical admission', () => {
  const p = plan();
  const initial = p.passes[0]!.operations[0]!;
  if (initial.op !== 'draw') throw Error();
  p.passes[0]!.operations = Array.from(
    { length: EFFECT_V1_GRAPH_LIMITS.expandedCommands + 1 },
    () => initial
  );
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.passes[0]!.operations = Array.from(
    { length: EFFECT_V1_GRAPH_LIMITS.expandedCommands },
    () => initial
  );
  expect(parseEffectRuntimeGpuPlan(p, request())).not.toBeNull();
  p.passes[0]!.operations = [...p.passes[0]!.operations, { op: 'clear' }];
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.resources.push({ id: 1, kind: 'primitive', bitmap: new Bitmap(), width: 10, height: 10 });
  p.passes[0]!.operations = [
    { ...initial, source: { kind: 'resource', id: 1 } },
    { ...initial, source: { kind: 'resource', id: 1 } },
  ];
  expect(parseEffectRuntimeGpuPlan(p, request())).toBeNull();
  p.passes[0]!.operations = [initial];
  expect(parseEffectRuntimeGpuPlan(p, request())).not.toBeNull();
});

it('admits parent plans only for explicit preparation with bounded synchronous tables', () => {
  const p = plan(),
    r = request();
  const expected = {
    ...r,
    kind: 'prepareGpuFrame' as const,
    documentRef: { id: r.documentRef.id },
    assetSelectionRef: { id: r.assetSelectionRef.id },
  };
  expect(parseEffectRuntimeGpuScenePlan(p, expected)).toEqual(p);
  expect(parseEffectRuntimeGpuScenePlan(p, { ...expected, kind: 'renderFrame' })).toBeNull();
  expect(parseEffectRuntimeGpuScenePlan({ ...p, requestId: 'wrong' }, expected)).toBeNull();
  expect(fitsEffectRuntimeGpuSceneTransport({ ...p, resources: Array(513) })).toBe(false);
  expect(fitsEffectRuntimeGpuSceneTransport({ ...p, passes: Array(65) })).toBe(false);
  expect(fitsEffectRuntimeGpuSceneTransport({ ...p, passes: [{ operations: Array(513) }] })).toBe(
    false
  );
});
