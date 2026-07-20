// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

import { sha256EffectV1Bytes } from '@sniptale/runtime-contracts/effect-v1';

import {
  EFFECT_RUNTIME_PROTOCOL_VERSION,
  type EffectRuntimeRenderRequest,
} from '../../contracts/effect-runtime/types';
import { createDocument } from '../worker/interpreter/support.test-support';
import { prepareEffectRuntimeWorkerRequest } from './prepare-frame';

class FakeBitmap implements ImageBitmap {
  readonly close = vi.fn();
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it('materializes SVG bytes and strips every inline author payload from the worker document', async () => {
  const bytes = new TextEncoder().encode('<svg viewBox="0 0 2 3"><path d="M0 0L1 1"/></svg>');
  const request = await createRequest('svg', bytes, 2, 3);
  Object.assign(request.document.assets[0]!, { dataUrl: 'data:', svgText: '<svg/>' });

  const prepared = await prepareEffectRuntimeWorkerRequest(request);

  expect(prepared.assetSelectionRef.assets!['svg']).toMatchObject({
    height: 3,
    kind: 'svg',
    width: 2,
  });
  expect(prepared.documentRef.document!.assets[0]).toMatchObject({
    path: 'runtime-assets/asset-0',
  });
  expect(prepared.documentRef.document!.assets[0]).not.toHaveProperty('dataUrl');
  expect(prepared.documentRef.document!.assets[0]).not.toHaveProperty('svgText');
});

it('decodes an exact PNG and closes a bitmap whose dimensions drift from declaration', async () => {
  const bytes = createPngHeader();
  const validBitmap = new FakeBitmap(1, 1);
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(validBitmap));
  const valid = await createRequest('image', bytes, 1, 1);

  await expect(prepareEffectRuntimeWorkerRequest(valid)).resolves.toMatchObject({
    assetSelectionRef: { assets: { image: { bitmap: validBitmap } } },
  });

  const invalidBitmap = new FakeBitmap(2, 1);
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(invalidBitmap));
  await expect(prepareEffectRuntimeWorkerRequest(valid)).rejects.toMatchObject({
    code: 'mediaDecodeFailed',
  });
  expect(invalidBitmap.close).toHaveBeenCalledOnce();
});

it('maps unknown assets, invalid UTF-8, and invalid worker documents to typed rejection', async () => {
  const bytes = new TextEncoder().encode('<svg/>');
  const request = await createRequest('svg', bytes, 1, 1);
  request.assets[0]!.id = 'missing';
  await expect(prepareEffectRuntimeWorkerRequest(request)).rejects.toMatchObject({
    code: 'inputRejected',
  });

  const invalidUtf8 = await createRequest('svg', Uint8Array.of(0xff), 1, 1);
  await expect(prepareEffectRuntimeWorkerRequest(invalidUtf8)).rejects.toMatchObject({
    code: 'inputRejected',
  });

  const invalidDocument = await createRequest('svg', bytes, 1, 1);
  invalidDocument.document.program.commands = [];
  await expect(prepareEffectRuntimeWorkerRequest(invalidDocument)).rejects.toMatchObject({
    code: 'inputRejected',
  });
});

it('closes all decoded raster assets when their aggregate backing bytes exceed the ceiling', async () => {
  const bytes = createPngHeader(3840, 2160);
  const request = await createRequest('image', bytes, 3840, 2160);
  const declaration = request.document.assets[0]!;
  request.assets = await Promise.all(
    Array.from({ length: 5 }, async (_, index) => ({
      ...request.assets[0]!,
      id: index === 0 ? 'image' : `image-${index}`,
      sha256: await sha256EffectV1Bytes(bytes),
    }))
  );
  request.document.assets = request.assets.map((asset) => ({
    ...declaration,
    id: asset.id,
    path: `assets/${asset.id}`,
    sha256: asset.sha256,
  }));
  const bitmaps = request.assets.map(() => new FakeBitmap(3840, 2160));
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmaps.shift()!)
  );
  const retained = [...bitmaps];

  await expect(prepareEffectRuntimeWorkerRequest(request)).rejects.toMatchObject({
    code: 'resourceLimit',
  });
  expect(retained.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});

async function createRequest(
  kind: 'image' | 'svg',
  bytes: Uint8Array,
  width: number,
  height: number
): Promise<EffectRuntimeRenderRequest> {
  const document = createDocument([
    kind === 'svg'
      ? { assetId: kind, height, op: 'svgParts', width, x: 0, y: 0 }
      : { assetId: kind, height, op: 'image', width, x: 0, y: 0 },
  ]);
  const sha256 = await sha256EffectV1Bytes(bytes);
  document.assets = [createDocumentAsset(kind, bytes.byteLength, width, height, sha256)];
  return {
    assets: [
      {
        byteLength: bytes.byteLength,
        bytes: bytes.slice().buffer,
        id: kind,
        kind,
        mimeType: document.assets[0]!.mimeType,
        sha256,
      },
    ],
    assetSelectionId: 'b'.repeat(64),
    assetSelectionPayloadIncluded: true,
    controls: {},
    document,
    documentId: 'a'.repeat(64),
    documentPayloadIncluded: true,
    duration: 2,
    effectInstanceId: 'instance',
    fps: 30,
    frameIndex: 30,
    height: 10,
    inputFrames: {},
    kind: 'renderFrame',
    progress: 0.5,
    protocolVersion: EFFECT_RUNTIME_PROTOCOL_VERSION,
    renderHeight: 10,
    renderWidth: 10,
    requestId: 'request',
    sequenceId: 1,
    snapshotId: 'snapshot',
    time: 1,
    width: 10,
  };
}

function createDocumentAsset(
  kind: 'image' | 'svg',
  byteLength: number,
  width: number,
  height: number,
  sha256: string
) {
  return {
    byteLength,
    height,
    id: kind,
    kind,
    mimeType: kind === 'svg' ? 'image/svg+xml' : 'image/png',
    path: `assets/${kind}`,
    sha256,
    width,
  };
}

function createPngHeader(width = 1, height = 1): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(bytes.buffer).setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}
