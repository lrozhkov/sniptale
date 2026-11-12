import { expect, it } from 'vitest';
import { parseRuntimeAnimationDocument } from '../../../contracts/effect-runtime/animation';
import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeWorkerMessage,
  type EffectRuntimeWorkerAsset,
} from '../../../contracts/effect-runtime/types';
import { parseEffectRuntimeWorkerRequest, resolveEffectRuntimeWorkerRequest } from './request';

function createRequest(): EffectRuntimeWorkerMessage {
  const document = parseRuntimeAnimationDocument({
    format: 'sniptale-animation',
    version: 1,
    id: 'boundary-proof',
    label: { en: 'Boundary proof' },
    controls: [
      { id: 'amount', kind: 'number', defaultValue: 1, min: 0, max: 2 },
      { id: 'accent', kind: 'color', defaultValue: '#ffffff' },
    ],
    bindings: [
      { kind: 'scalar', slot: 'amount', control: 'amount' },
      { kind: 'color', slot: 'accent', control: 'accent' },
    ],
    resources: [],
    animation: {
      v: '5.12.2',
      w: 320,
      h: 180,
      fr: 30,
      ip: 30,
      op: 90,
      layers: [],
      assets: [],
      slots: { amount: { p: { a: 0, k: 1 } }, accent: { p: { a: 0, k: [1, 1, 1] } } },
    },
  });
  if (!document) throw new Error('Invalid boundary fixture');
  const documentId = 'c'.repeat(64);
  return {
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    documentRef: { id: documentId, document },
    assetSelectionRef: { id: 'd'.repeat(64), assets: {} },
    snapshotId: `effect:${documentId}`,
    effectInstanceId: 'instance',
    requestId: 'request',
    sequenceId: 1,
    controls: { amount: 1, accent: '#ffffff' },
    width: 320,
    height: 180,
    renderWidth: 160,
    renderHeight: 90,
    duration: 2,
    time: 1,
    progress: 0.5,
    frameIndex: 30,
    fps: 30,
    inputFrames: {},
  };
}

it('accepts an immutable local Lottie package with intrinsic geometry and its exact source clock', () => {
  const request = createRequest(),
    before = structuredClone(request);
  expect(parseEffectRuntimeWorkerRequest(request)).toMatchObject({
    controls: request.controls,
    time: 1,
    progress: 0.5,
    duration: 2,
    width: 320,
    height: 180,
    renderWidth: 160,
    renderHeight: 90,
    document: request.documentRef.document,
    assets: {},
    inputFrames: {},
  });
  expect(request).toEqual(before);
});

it('rejects identity, timing, dimensions, controls and input contract drift', () => {
  const base = createRequest();
  for (const value of [
    null,
    { ...base, extra: true },
    { ...base, protocolVersion: 1 },
    { ...base, documentRef: { document: {}, id: base.documentRef.id } },
    { ...base, snapshotId: `effect:${'a'.repeat(64)}` },
    { ...base, duration: 3 },
    { ...base, fps: 0 },
    { ...base, frameIndex: -1 },
    { ...base, time: 3 },
    { ...base, progress: 0.25 },
    { ...base, width: 0 },
    { ...base, width: 321 },
    { ...base, renderWidth: 0 },
    { ...base, renderHeight: Infinity },
    { ...base, controls: { extra: 1 } },
    { ...base, controls: { amount: 3, accent: '#ffffff' } },
    { ...base, controls: { amount: '1', accent: '#ffffff' } },
    { ...base, controls: { amount: 1, accent: 1 } },
    { ...base, inputFrames: { source: {} } },
  ])
    expect(parseEffectRuntimeWorkerRequest(value), JSON.stringify(value)?.slice(0, 180)).toBeNull();
});

it.each(['gpu-plan', 'canvas', '', null, 1, {}])(
  'refuses the removed renderTarget selector %j',
  (renderTarget) => {
    expect(parseEffectRuntimeWorkerRequest({ ...createRequest(), renderTarget })).toBeNull();
  }
);

it.each(['image', 'svg', 'audio'])(
  'refuses detached %s assets instead of acquiring them',
  (kind) => {
    const request = createRequest();
    expect(
      parseEffectRuntimeWorkerRequest({
        ...request,
        assetSelectionRef: {
          id: request.assetSelectionRef.id,
          assets: { foreign: { kind, id: 'foreign' } },
        },
      })
    ).toBeNull();
  }
);

it('retains acknowledgement cache identity and classifies a genuinely missing reference', () => {
  const request = createRequest(),
    document = request.documentRef.document;
  if (!document) throw new Error('Missing document');
  const documents = new Map<string, typeof document>();
  const assets = new Map<string, Record<string, EffectRuntimeWorkerAsset>>();
  const cache = {
    getDocument: (id: string) => documents.get(id) ?? null,
    getAssets: (id: string) => assets.get(id) ?? null,
    setDocument: (id: string, value: typeof document) => {
      documents.set(id, value);
    },
    setAssets: (id: string, value: Record<string, EffectRuntimeWorkerAsset>) => {
      assets.set(id, value);
      return true;
    },
  };
  expect(resolveEffectRuntimeWorkerRequest(request, cache).ok).toBe(true);
  const referenced = {
    ...request,
    documentRef: { id: request.documentRef.id },
    assetSelectionRef: { id: request.assetSelectionRef.id },
  };
  expect(resolveEffectRuntimeWorkerRequest(referenced, cache)).toMatchObject({
    ok: true,
    request: { document, assets: {}, time: 1 },
  });
  documents.clear();
  expect(resolveEffectRuntimeWorkerRequest(referenced, cache)).toEqual({
    ok: false,
    code: 'cacheMiss',
    missingRef: 'document',
  });
  documents.set(request.documentRef.id, document);
  assets.clear();
  expect(resolveEffectRuntimeWorkerRequest(referenced, cache)).toEqual({
    ok: false,
    code: 'cacheMiss',
    missingRef: 'assetSelection',
  });
});
