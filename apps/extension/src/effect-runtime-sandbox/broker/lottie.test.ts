import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEffectRuntimeAssetSelectionId } from '../../contracts/effect-runtime/immutable-refs';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_RESPONSE,
  type EffectRuntimeRenderMessage,
} from '../../contracts/effect-runtime/types';
import { createEffectRuntimeWorkerExecutionState } from '../worker/execute';
import { createEffectRuntimeBrokerSession } from './session';
import { finishWorkerStartupOnFirstListener } from './worker.test-support';

class Bitmap {
  close = vi.fn();
  constructor(
    public width: number,
    public height: number
  ) {}
}
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => vi.unstubAllGlobals());
async function message(): Promise<EffectRuntimeRenderMessage> {
  const source = JSON.stringify({
    format: 'sniptale-animation',
    version: 1,
    id: 'proof',
    label: { en: 'Proof' },
    controls: [],
    bindings: [],
    resources: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 90, layers: [], assets: [] },
  });
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))),
    (value) => value.toString(16).padStart(2, '0')
  ).join('');
  return {
    kind: 'prepareGpuFrame',
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    documentRef: { id, source },
    assetSelectionRef: { id: await createEffectRuntimeAssetSelectionId([]), assets: [] },
    effectInstanceId: 'instance-1',
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${id}`,
    controls: {},
    width: 320,
    height: 180,
    renderWidth: 160,
    renderHeight: 90,
    inputFrames: {},
    duration: 2,
    time: 0.5,
    progress: 0.25,
    frameIndex: 30,
    fps: 60,
  };
}
function runtime() {
  const render = vi.fn(
    async ({ width, height }: { width: number; height: number }) => new Bitmap(width, height)
  );
  const dispose = vi.fn(),
    createRenderer = vi.fn(async () => ({ render, dispose }));
  const execution = createEffectRuntimeWorkerExecutionState({ createRenderer });
  const posted: unknown[] = [];
  const worker: Worker = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    terminate() {
      execution.dispose();
    },
    postMessage(value: unknown) {
      posted.push(value);
      void execution.execute(value).then((result) =>
        worker.onmessage?.(
          new MessageEvent('message', {
            data: { type: EFFECT_RUNTIME_WORKER_RESPONSE, result },
          })
        )
      );
    },
  };
  const session = createEffectRuntimeBrokerSession({
    compositionBackend: 'gpu-scene-plan',
    workerFactory: () => finishWorkerStartupOnFirstListener(worker),
  });
  return { session, posted, createRenderer, render, dispose, execution };
}
it('passes a checked self-contained package through broker and worker and reuses acknowledged references', async () => {
  const input = await message(),
    state = runtime();
  expect(await state.session.execute(input)).toMatchObject({
    kind: 'frame',
    width: 160,
    height: 90,
    requestId: 'request-1',
  });
  expect(
    await state.session.execute({
      ...input,
      requestId: 'request-2',
      sequenceId: 2,
      documentRef: { id: input.documentRef.id },
      assetSelectionRef: { id: input.assetSelectionRef.id },
    })
  ).toMatchObject({ kind: 'frame', requestId: 'request-2', sequenceId: 2 });
  expect(state.createRenderer).toHaveBeenCalledOnce();
  expect(state.posted).toHaveLength(2);
  expect(state.posted[0]).toMatchObject({
    assetSelectionRef: { assets: {} },
    documentRef: { document: { format: 'sniptale-animation' } },
  });
  expect(state.posted[1]).not.toHaveProperty('renderTarget');
  expect(state.render).toHaveBeenLastCalledWith(
    expect.objectContaining({ time: 0.5, width: 160, height: 90 })
  );
  expect(state.session.snapshot()).toEqual({
    activeRequests: 0,
    consecutiveFailures: 0,
    circuitOpen: false,
  });
  state.execution.dispose();
  expect(state.dispose).toHaveBeenCalledOnce();
});
it('rejects a poisoned package before the worker or any decoder receives it', async () => {
  const input = await message(),
    state = runtime();
  expect(
    await state.session.execute({
      ...input,
      documentRef: { ...input.documentRef, source: `${input.documentRef.source} ` },
    })
  ).toMatchObject({ code: 'inputRejected' });
  expect(state.posted).toHaveLength(0);
  expect(state.createRenderer).not.toHaveBeenCalled();
  state.execution.dispose();
});
it('refuses detached assets and inconsistent clocks without mutating the source', async () => {
  const input = await message(),
    state = runtime(),
    before = structuredClone(input);
  expect(
    await state.session.execute({
      ...input,
      assetSelectionRef: { ...input.assetSelectionRef, assets: [{}] },
    })
  ).toMatchObject({ code: 'inputRejected' });
  expect(await state.session.execute({ ...input, progress: 0.8 })).toMatchObject({
    code: 'inputRejected',
  });
  expect(state.posted).toHaveLength(0);
  expect(input).toEqual(before);
  state.execution.dispose();
});
