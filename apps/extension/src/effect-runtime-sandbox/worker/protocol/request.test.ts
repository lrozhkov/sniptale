import { expect, it, vi } from 'vitest';

import type { EffectV1Document } from '@sniptale/runtime-contracts/effect-v1';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  EFFECT_RUNTIME_WORKER_REQUEST,
  type EffectRuntimeWorkerMessage,
} from '../../../contracts/effect-runtime/types';
import { createDocument } from '../interpreter/support.test-support';
import { parseWorkerAssets } from './request-assets';
import { parseEffectRuntimeWorkerRequest } from './request';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

it('rejects identity, timing, dimensions, controls, and input contract drift', () => {
  const base = createRequest();
  const variants = [
    null,
    { ...base, extra: true },
    { ...base, protocolVersion: 1 },
    { ...base, documentRef: { document: {}, id: base.documentRef.id } },
    { ...base, duration: 3 },
    { ...base, fps: 0 },
    { ...base, frameIndex: -1 },
    { ...base, time: 3 },
    { ...base, progress: 0.25 },
    { ...base, width: 0 },
    { ...base, controls: { extra: 1 } },
    { ...base, inputFrames: { source: {} } },
  ];

  for (const variant of variants) expect(parseEffectRuntimeWorkerRequest(variant)).toBeNull();
});

it('accepts bounded controls and exact target input while rejecting value drift', () => {
  const request = createRequest();
  request.documentRef.document!.kind = 'targetEffect';
  request.documentRef.document!.controls = [
    { defaultValue: 1, id: 'amount', kind: 'number', max: 2, min: 0 },
    { defaultValue: '#fff', id: 'color', kind: 'color' },
  ];
  request.documentRef.document!.program.commands = [
    {
      height: 10,
      input: 'source',
      op: 'image',
      width: 10,
      x: { op: 'read', path: 'controls.amount' },
      y: 0,
    },
    {
      fill: { op: 'read', path: 'controls.color' },
      height: 1,
      op: 'fillRect',
      width: 1,
      x: 0,
      y: 0,
    },
  ];
  request.controls = { amount: 1, color: '#fff' };
  const bitmap = new FakeBitmap(10, 10);
  request.inputFrames = { source: { bitmap, height: 10, width: 10 } };

  expect(parseEffectRuntimeWorkerRequest(request)).toMatchObject({ controls: request.controls });
  expect(
    parseEffectRuntimeWorkerRequest({ ...request, controls: { amount: 3, color: '#fff' } })
  ).toBeNull();
  expect(
    parseEffectRuntimeWorkerRequest({
      ...request,
      controls: { amount: 1, color: 'x'.repeat(4097) },
    })
  ).toBeNull();
  request.inputFrames.source!.width = 9;
  expect(parseEffectRuntimeWorkerRequest(request)).toBeNull();
});

it('parses exact image, SVG, and ignored audio declarations', () => {
  const image = new FakeBitmap(10, 10);
  const document = createAssetDocument();
  const assets = {
    image: {
      bitmap: image,
      cacheKey: 'a'.repeat(64),
      height: 10,
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      width: 10,
    },
    svg: {
      cacheKey: 'b'.repeat(64),
      height: 10,
      id: 'svg',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      svgVector: { height: 10, parts: [], width: 10 },
      width: 10,
    },
  };

  expect(parseWorkerAssets(assets, document)).toMatchObject({
    image: { bitmap: image },
    svg: { kind: 'svg' },
  });
  expect(parseWorkerAssets(null, document)).toBeNull();
  expect(parseWorkerAssets({}, document)).toBeNull();
  expect(
    parseWorkerAssets({ ...assets, image: { ...assets.image, cacheKey: 'bad' } }, document)
  ).toBeNull();
  expect(
    parseWorkerAssets({ ...assets, image: { ...assets.image, width: 9 } }, document)
  ).toBeNull();
  expect(
    parseWorkerAssets({ ...assets, svg: { ...assets.svg, mimeType: 'image/png' } }, document)
  ).toBeNull();
  expect(
    parseWorkerAssets({ ...assets, svg: { ...assets.svg, svgVector: null } }, document)
  ).toBeNull();
  expect(parseWorkerAssets({ ...assets, svg: { ...assets.svg, width: 9 } }, document)).toBeNull();
});

function createRequest(): EffectRuntimeWorkerMessage {
  const documentId = 'c'.repeat(64);
  return {
    assetSelectionRef: { assets: {}, id: 'd'.repeat(64) },
    controls: {},
    documentRef: { document: createDocument([{ op: 'clear' }]), id: documentId },
    duration: 2,
    effectInstanceId: 'instance',
    fps: 30,
    frameIndex: 30,
    height: 10,
    inputFrames: {},
    progress: 0.5,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 10,
    renderWidth: 10,
    requestId: 'request',
    sequenceId: 1,
    snapshotId: `effect:${documentId}`,
    time: 1,
    type: EFFECT_RUNTIME_WORKER_REQUEST,
    width: 10,
  };
}

function createAssetDocument(): EffectV1Document {
  const document = createDocument([{ op: 'clear' }]);
  document.assets = [
    {
      byteLength: 10,
      height: 10,
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      path: 'runtime-assets/image',
      sha256: 'a'.repeat(64),
      width: 10,
    },
    {
      byteLength: 10,
      height: 10,
      id: 'svg',
      kind: 'svg',
      mimeType: 'image/svg+xml',
      path: 'runtime-assets/svg',
      sha256: 'b'.repeat(64),
      width: 10,
    },
    {
      byteLength: 10,
      id: 'audio',
      kind: 'audio',
      mimeType: 'audio/wav',
      path: 'runtime-assets/audio',
      sha256: 'c'.repeat(64),
    },
  ];
  return document;
}
