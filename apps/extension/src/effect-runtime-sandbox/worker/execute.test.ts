import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseRuntimeAnimationDocument } from '../../contracts/effect-runtime/animation';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
} from '../../contracts/effect-runtime/types';
import {
  createEffectRuntimeWorkerExecutionState,
  executeEffectRuntimeWorkerRequest,
} from './execute';
import { LottieResourceIdentityError } from './lottie';

class Bitmap {
  close = vi.fn();
  constructor(
    public width: number,
    public height: number
  ) {}
}
beforeEach(() => vi.stubGlobal('ImageBitmap', Bitmap));
afterEach(() => vi.unstubAllGlobals());
function request() {
  const document = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'proof',
    label: { en: 'Proof' },
    controls: [],
    bindings: [],
    resources: [],
    animation: { v: '5.12.2', w: 320, h: 180, fr: 30, ip: 30, op: 90, layers: [], assets: [] },
  });
  if (!document) throw new Error('Invalid fixture.');
  return {
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    documentRef: { id: 'c'.repeat(64), document },
    assetSelectionRef: { id: 'd'.repeat(64), assets: {} },
    effectInstanceId: 'instance-1',
    requestId: 'request-1',
    sequenceId: 1,
    snapshotId: `effect:${'c'.repeat(64)}`,
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
function dependencies() {
  const dispose = vi.fn();
  const render = vi.fn(
    async ({ width, height }: { width: number; height: number }) => new Bitmap(width, height)
  );
  const createRenderer = vi.fn(async () => ({ render, dispose }));
  return { createRenderer, render, dispose };
}
it.each([
  [160, 90],
  [640, 360],
])(
  'returns requested physical raster %i × %i with the original local clock',
  async (width, height) => {
    const deps = dependencies(),
      input = { ...request(), renderWidth: width, renderHeight: height };
    const before = structuredClone(input);
    const result = await executeEffectRuntimeWorkerRequest(input, deps);
    expect(result).toMatchObject({
      kind: 'frame',
      width,
      height,
      requestId: 'request-1',
      sequenceId: 1,
      acknowledged: {
        documentId: input.documentRef.id,
        assetSelectionId: input.assetSelectionRef.id,
      },
    });
    expect(deps.render).toHaveBeenCalledWith(
      expect.objectContaining({ time: 0.5, width, height, values: {} })
    );
    expect(input).toEqual(before);
    expect(deps.dispose).toHaveBeenCalledOnce();
  }
);
it('reuses a retained player through acknowledged references and destroys it once on disposal', async () => {
  const deps = dependencies(),
    state = createEffectRuntimeWorkerExecutionState(deps),
    input = request();
  expect(await state.execute(input)).toMatchObject({ kind: 'frame' });
  expect(
    await state.execute({
      ...input,
      requestId: 'request-2',
      documentRef: { id: input.documentRef.id },
      assetSelectionRef: { id: input.assetSelectionRef.id },
    })
  ).toMatchObject({ kind: 'frame', requestId: 'request-2' });
  expect(deps.createRenderer).toHaveBeenCalledOnce();
  state.dispose();
  state.dispose();
  expect(deps.dispose).toHaveBeenCalledOnce();
  expect(state.snapshot().models).toEqual({ entries: 0, weight: 0 });
});
it.each(['document', 'assetSelection'] as const)(
  'returns the missing %s reference without creating a player',
  async (missing) => {
    const input = request(),
      deps = dependencies();
    const value =
      missing === 'document'
        ? { ...input, documentRef: { id: input.documentRef.id } }
        : { ...input, assetSelectionRef: { id: input.assetSelectionRef.id } };
    expect(await executeEffectRuntimeWorkerRequest(value, deps)).toMatchObject({
      kind: 'error',
      code: 'cacheMiss',
      missingRef: missing,
    });
    expect(deps.createRenderer).not.toHaveBeenCalled();
  }
);
it('rejects and closes foreign source frames before cache-miss retry', async () => {
  const bitmap = new Bitmap(320, 180),
    deps = dependencies(),
    input = request();
  expect(
    await executeEffectRuntimeWorkerRequest(
      {
        ...input,
        documentRef: { id: input.documentRef.id },
        inputFrames: { source: { bitmap, width: 320, height: 180 } },
      },
      deps
    )
  ).toMatchObject({ code: 'malformed' });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(deps.createRenderer).not.toHaveBeenCalled();
});
it.each([
  { protocolVersion: 6 },
  { renderWidth: 0 },
  { duration: 3 },
  { renderTarget: 'gpu-plan' },
  { documentRef: { id: 'c'.repeat(64), document: { kind: 'annotation', version: 1 } } },
])('rejects retired or inconsistent envelopes %j', async (patch) => {
  const deps = dependencies();
  expect(await executeEffectRuntimeWorkerRequest({ ...request(), ...patch }, deps)).toMatchObject({
    kind: 'error',
    code: 'malformed',
  });
  expect(deps.createRenderer).not.toHaveBeenCalled();
});
it('serializes player mutation and drops a late bitmap after disposal', async () => {
  const deps = dependencies(),
    started = Promise.withResolvers<void>(),
    pending = Promise.withResolvers<Bitmap>();
  deps.render.mockImplementationOnce(() => {
    started.resolve();
    return pending.promise;
  });
  const state = createEffectRuntimeWorkerExecutionState(deps),
    input = request();
  const first = state.execute(input);
  await started.promise;
  const second = state.execute({ ...input, requestId: 'request-2' });
  expect(deps.render).toHaveBeenCalledOnce();
  state.dispose();
  const bitmap = new Bitmap(160, 90);
  pending.resolve(bitmap);
  expect(await first).toMatchObject({ code: 'stale' });
  expect(await second).toMatchObject({ code: 'stale' });
  expect(bitmap.close).toHaveBeenCalledOnce();
  expect(deps.render).toHaveBeenCalledOnce();
});
it('closes a malformed raster and classifies resource identity refusal', async () => {
  const deps = dependencies(),
    bitmap = new Bitmap(1, 1);
  deps.render.mockResolvedValueOnce(bitmap);
  expect(await executeEffectRuntimeWorkerRequest(request(), deps)).toMatchObject({
    code: 'outputRejected',
  });
  expect(bitmap.close).toHaveBeenCalledOnce();
  deps.createRenderer.mockRejectedValueOnce(new LottieResourceIdentityError());
  expect(await executeEffectRuntimeWorkerRequest(request(), deps)).toMatchObject({
    code: 'inputRejected',
  });
});

it('retains distinct mutable players when instances alternate the same document', async () => {
  const first = dependencies(),
    second = dependencies(),
    createRenderer = vi
      .fn()
      .mockResolvedValueOnce({ render: first.render, dispose: first.dispose })
      .mockResolvedValueOnce({ render: second.render, dispose: second.dispose });
  const state = createEffectRuntimeWorkerExecutionState({ createRenderer }),
    input = request();
  const document = parseRuntimeAnimationDocument({
    ...input.documentRef.document,
    controls: [{ id: 'opacity', kind: 'number', defaultValue: 100, min: 0, max: 100 }],
  });
  if (!document) throw new Error('Invalid controlled animation.');
  try {
    for (let index = 0; index < 4; index++) {
      const result = await state.execute({
        ...input,
        requestId: `request-${index}`,
        effectInstanceId: index % 2 ? 'instance-b' : 'instance-a',
        documentRef: {
          id: input.documentRef.id,
          ...(index === 0 ? { document } : {}),
        },
        assetSelectionRef: {
          id: input.assetSelectionRef.id,
          ...(index === 0 ? { assets: {} } : {}),
        },
        controls: { opacity: index % 2 ? 80 : 20 },
        time: index / 60,
        progress: index / 120,
        frameIndex: index,
      });
      expect(result).toMatchObject({ kind: 'frame', requestId: `request-${index}` });
    }
    expect(createRenderer).toHaveBeenCalledTimes(2);
    expect(first.render).toHaveBeenCalledTimes(2);
    expect(second.render).toHaveBeenCalledTimes(2);
    expect(first.render).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: { opacity: 20 } })
    );
    expect(second.render).toHaveBeenLastCalledWith(
      expect.objectContaining({ values: { opacity: 80 } })
    );
  } finally {
    state.dispose();
  }
  expect(first.dispose).toHaveBeenCalledOnce();
  expect(second.dispose).toHaveBeenCalledOnce();
});

it('keeps eight instance players and preserves their shared immutable document reference', async () => {
  const deps = dependencies(),
    state = createEffectRuntimeWorkerExecutionState(deps),
    input = request();
  for (let index = 0; index < 9; index++) {
    expect(
      await state.execute({
        ...input,
        requestId: `request-${index}`,
        effectInstanceId: `instance-${index}`,
        documentRef: index ? { id: input.documentRef.id } : input.documentRef,
        assetSelectionRef: index ? { id: input.assetSelectionRef.id } : input.assetSelectionRef,
      })
    ).toMatchObject({ kind: 'frame' });
  }
  expect(deps.createRenderer).toHaveBeenCalledTimes(9);
  expect(deps.dispose).toHaveBeenCalledOnce();
  expect(state.snapshot().canvases.entries).toBe(8);
  state.dispose();
  expect(deps.dispose).toHaveBeenCalledTimes(9);
});

it('applies the existing raster byte budget across instances of one document', async () => {
  const deps = dependencies(),
    state = createEffectRuntimeWorkerExecutionState(deps),
    input = request();
  for (let index = 0; index < 5; index++) {
    expect(
      await state.execute({
        ...input,
        requestId: `request-${index}`,
        effectInstanceId: `instance-${index}`,
        documentRef: index ? { id: input.documentRef.id } : input.documentRef,
        assetSelectionRef: index ? { id: input.assetSelectionRef.id } : input.assetSelectionRef,
        renderWidth: 3840,
        renderHeight: 2160,
      })
    ).toMatchObject({ kind: 'frame' });
  }
  expect(state.snapshot().models.entries).toBe(4);
  expect(state.snapshot().models.weight).toBeLessThanOrEqual(128 * 1024 * 1024);
  expect(deps.dispose).toHaveBeenCalledOnce();
  state.dispose();
  expect(deps.dispose).toHaveBeenCalledTimes(5);
});

it('retires every instance on a full document replacement and recovers reference-only requests', async () => {
  const deps = dependencies(),
    state = createEffectRuntimeWorkerExecutionState(deps),
    input = request();
  expect(await state.execute(input)).toMatchObject({ kind: 'frame' });
  const second = {
    ...input,
    effectInstanceId: 'instance-2',
    documentRef: { id: input.documentRef.id },
    assetSelectionRef: { id: input.assetSelectionRef.id },
  };
  expect(await state.execute(second)).toMatchObject({ kind: 'frame' });
  expect(deps.createRenderer).toHaveBeenCalledTimes(2);
  expect(await state.execute({ ...input, requestId: 'replacement' })).toMatchObject({
    kind: 'frame',
  });
  expect(deps.dispose).toHaveBeenCalledTimes(2);
  expect(state.snapshot().models.entries).toBe(1);
  expect(await state.execute(second)).toMatchObject({ kind: 'frame' });
  expect(deps.createRenderer).toHaveBeenCalledTimes(4);
  state.dispose();
  expect(deps.dispose).toHaveBeenCalledTimes(4);
});
