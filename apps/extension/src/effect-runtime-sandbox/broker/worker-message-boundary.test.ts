import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeGpuPlanResult,
  type EffectRuntimeWorkerMessage,
} from '../../contracts/effect-runtime/types';
import {
  closeEffectRuntimeWorkerResponse,
  parseEffectRuntimeWorkerResponse,
} from './worker-message-boundary';
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
it('requires expected request metadata before admitting worker plans', () => {
  const p = plan();
  expect(
    parseEffectRuntimeWorkerResponse({ type: EFFECT_RUNTIME_WORKER_RESPONSE, result: p }, request())
  ).toEqual(p);
  expect(
    parseEffectRuntimeWorkerResponse({ type: EFFECT_RUNTIME_WORKER_RESPONSE, result: p })
  ).toBeNull();
});
it('directly closes malformed and metadata-heavy flat tables exactly once per bitmap', () => {
  const bitmap = new Bitmap();
  const p = {
    kind: 'gpu-plan',
    resources: [{ bitmap }, { bitmap }, null],
    passes: Array.from({ length: 2000 }, () => ({ operations: [] })),
  };
  closeEffectRuntimeWorkerResponse({ type: 'malformed', result: p });
  expect(bitmap.close).toHaveBeenCalledOnce();
});
it('preserves ordinary frame and retry response parsing and cleanup', () => {
  const p = plan();
  const bitmap = new Bitmap();
  const {
    resources: _resources,
    inputResources: _inputs,
    rootPass: _root,
    passes: _passes,
    logicalWidth: _lw,
    logicalHeight: _lh,
    ...base
  } = p;
  const frame = { ...base, kind: 'frame', bitmap };
  expect(
    parseEffectRuntimeWorkerResponse({ type: EFFECT_RUNTIME_WORKER_RESPONSE, result: frame })
  ).toEqual(frame);
  closeEffectRuntimeWorkerResponse(frame);
  expect(bitmap.close).toHaveBeenCalledOnce();
  const retry = {
    effectInstanceId: p.effectInstanceId,
    requestId: p.requestId,
    snapshotId: p.snapshotId,
    sequenceId: p.sequenceId,
    kind: 'error',
    code: 'cacheMiss',
    missingRef: 'document',
    retryInputs: { source: { bitmap: new Bitmap(), width: 10, height: 10 } },
  };
  expect(
    parseEffectRuntimeWorkerResponse({ type: EFFECT_RUNTIME_WORKER_RESPONSE, result: retry })
  ).toEqual(retry);
  closeEffectRuntimeWorkerResponse(retry);
  expect(retry.retryInputs.source.bitmap.close).toHaveBeenCalledOnce();
});
