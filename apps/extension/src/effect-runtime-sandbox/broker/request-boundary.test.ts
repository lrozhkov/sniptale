import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { parseEffectRuntimeRenderRequest } from './request-boundary';
import {
  parseControls,
  parseFrameDimensions,
  parseInputFrames,
  parseRenderDimensions,
  parseTiming,
} from './request-fields';
import {
  createAnimationDocument,
  createEffectRuntimeRenderMessage,
  FakeImageBitmap,
  sourceDigest,
} from './request-boundary.test-support';
import { createEffectRuntimeDocumentCache } from './cache/documents';
import { createEffectRuntimeAssetSelectionCache } from './cache/asset-selections';

beforeEach(() => vi.stubGlobal('ImageBitmap', FakeImageBitmap));
afterEach(() => vi.unstubAllGlobals());
const createMessage = createEffectRuntimeRenderMessage;

it('accepts a byte-verified local animation with intrinsic logical bounds and a separate physical raster', async () => {
  const message = await createMessage();
  message.renderWidth = 640;
  message.renderHeight = 360;
  const before = structuredClone(message);
  const result = await parseEffectRuntimeRenderRequest(message);
  expect(result).toMatchObject({
    ok: true,
    request: {
      document: { format: 'sniptale-animation', animation: { ip: 30, op: 90 } },
      width: 1280,
      height: 720,
      renderWidth: 640,
      renderHeight: 360,
      inputFrames: {},
      assets: [],
      time: 0.5,
      duration: 2,
    },
  });
  expect(message).toEqual(before);
});

it('resolves acknowledged immutable refs', async () => {
  const cache = createEffectRuntimeDocumentCache(),
    assets = createEffectRuntimeAssetSelectionCache();
  const full = await createMessage();
  expect(await parseEffectRuntimeRenderRequest(full, cache, assets)).toMatchObject({ ok: true });
  expect(
    await parseEffectRuntimeRenderRequest(
      {
        ...full,
        documentRef: { id: full.documentRef.id },
        assetSelectionRef: { id: full.assetSelectionRef.id },
      },
      cache,
      assets
    )
  ).toMatchObject({ ok: true });
});

it('reports exact immutable-ref misses after cache reset', async () => {
  const cache = createEffectRuntimeDocumentCache(),
    assets = createEffectRuntimeAssetSelectionCache();
  const full = await createMessage();
  await parseEffectRuntimeRenderRequest(full, cache, assets);
  cache.clear();
  expect(
    await parseEffectRuntimeRenderRequest(
      {
        ...full,
        documentRef: { id: full.documentRef.id },
        assetSelectionRef: { id: full.assetSelectionRef.id },
      },
      cache,
      assets
    )
  ).toEqual({
    ok: false,
    failure: {
      code: 'cacheMiss',
      kind: 'error',
      missingRef: 'document',
      effectInstanceId: full.effectInstanceId,
      requestId: full.requestId,
      sequenceId: full.sequenceId,
      snapshotId: full.snapshotId,
    },
  });
  expect(
    await parseEffectRuntimeRenderRequest(
      { ...full, assetSelectionRef: { id: full.assetSelectionRef.id } },
      createEffectRuntimeDocumentCache(),
      createEffectRuntimeAssetSelectionCache()
    )
  ).toMatchObject({ ok: false, failure: { code: 'cacheMiss', missingRef: 'assetSelection' } });
});

it('rejects source/hash drift before trusting the document', async () => {
  const message = await createMessage();
  message.documentRef.source = message.documentRef.source!.replace('safe-effect', 'changed-effect');
  expect(await parseEffectRuntimeRenderRequest(message)).toMatchObject({
    ok: false,
    failure: { code: 'inputRejected', requestId: message.requestId },
  });
});

it.each(['standalone', 'targetEffect', 'transition'])(
  'refuses the retired %s document even with a matching source digest',
  async (kind) => {
    const message = await createMessage();
    const source = JSON.stringify({
      schemaVersion: 'sniptale.effect.v1',
      kind,
      program: { kind: 'graph', commands: [{ op: 'clear' }] },
    });
    const id = await sourceDigest(source);
    expect(
      await parseEffectRuntimeRenderRequest({
        ...message,
        documentRef: { id, source },
        snapshotId: `effect:${id}`,
      })
    ).toMatchObject({ ok: false, failure: { code: 'inputRejected' } });
  }
);

it('rejects malformed immutable-reference envelopes and snapshot drift', async () => {
  const message = await createMessage();
  for (const patch of [
    { documentRef: null },
    { assetSelectionRef: null },
    { documentRef: { id: message.documentRef.id, source: 42 } },
  ])
    expect(await parseEffectRuntimeRenderRequest({ ...message, ...patch })).toMatchObject({
      ok: false,
      failure: { code: 'malformed' },
    });
  expect(
    await parseEffectRuntimeRenderRequest({ ...message, snapshotId: 'effect:wrong' })
  ).toMatchObject({ ok: false, failure: { code: 'inputRejected' } });
});

it('bounds broker dimensions and timing', () => {
  expect(parseFrameDimensions(640, 360)).toEqual({ width: 640, height: 360 });
  expect(parseFrameDimensions(0, 360)).toBeNull();
  expect(parseRenderDimensions(640, 360, { width: 1280, height: 720 })).toEqual({
    width: 640,
    height: 360,
  });
  expect(parseRenderDimensions(640, 360, null)).toBeNull();
  expect(parseRenderDimensions(1920, 1080, { width: 1280, height: 720 })).toEqual({
    width: 1920,
    height: 1080,
  });
  const timing = { duration: 2, fps: 30, frameIndex: 15, progress: 0.25, time: 0.5 };
  expect(parseTiming(timing, 2)).toEqual(timing);
  for (const invalid of [
    { ...timing, duration: 3 },
    { ...timing, fps: 0 },
    { ...timing, frameIndex: 1.5 },
    { ...timing, progress: 0.4 },
    { ...timing, time: 3 },
  ])
    expect(parseTiming(invalid, 2)).toBeNull();
});

it('bounds complete controls with the shared animation contract and refuses foreign input ownership', () => {
  const document = {
    ...createAnimationDocument(),
    controls: [
      { defaultValue: 0.5, id: 'amount', kind: 'number' as const, min: 0, max: 1 },
      { defaultValue: 'label', id: 'label', kind: 'text' as const },
    ],
  };
  expect(parseControls({ amount: 0.75, label: 'safe' }, document)).toEqual({
    amount: 0.75,
    label: 'safe',
  });
  expect(parseControls({ amount: 2, label: 'safe' }, document)).toBeNull();
  expect(parseControls({ amount: 0.5, extra: true, label: 'safe' }, document)).toBeNull();
  expect(parseControls({ amount: 0.5 }, document)).toBeNull();
  expect(parseControls({ amount: 0.5, label: 'x'.repeat(4097) }, document)).not.toBeNull();
  expect(parseControls({ amount: 0.5, label: 'x'.repeat(32768) }, document)).not.toBeNull();
  expect(parseControls({ amount: 0.5, label: 'x'.repeat(32769) }, document)).toBeNull();
  const dimensions = { width: 640, height: 360 };
  expect(parseInputFrames({}, document, dimensions)).toEqual({});
  expect(parseInputFrames({}, document, null)).toBeNull();
  const bitmap = new FakeImageBitmap(640, 360);
  for (const value of [
    { source: { bitmap, ...dimensions } },
    { from: { bitmap, ...dimensions }, to: { bitmap, ...dimensions } },
    {
      from: { bitmap, ...dimensions },
      to: { bitmap: new FakeImageBitmap(640, 360), ...dimensions },
    },
  ])
    expect(parseInputFrames(value, document, dimensions)).toBeNull();
});

it.each(['source', 'from', 'to'] as const)(
  'rejects a foreign %s frame on an otherwise valid package',
  async (key) => {
    const message = await createMessage();
    const bitmap = new FakeImageBitmap(1280, 720);
    expect(
      await parseEffectRuntimeRenderRequest({
        ...message,
        inputFrames: { [key]: { bitmap, width: 1280, height: 720 } },
      })
    ).toMatchObject({ ok: false, failure: { code: 'inputRejected' } });
  }
);

it('accepts local image bytes and rejects poisoning even after a new whole-package digest', async () => {
  const document = createAnimationDocument();
  const bytes = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlSAAAAAASUVORK5CYII='
    ),
    (c) => c.charCodeAt(0)
  );
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (v) =>
    v.toString(16).padStart(2, '0')
  ).join('');
  document.resources = [
    {
      path: 'images/proof.png',
      mimeType: 'image/png',
      byteLength: bytes.length,
      sha256,
      base64: btoa(String.fromCharCode(...bytes)),
    },
  ];
  document.animation['assets'] = [{ id: 'image', u: 'images/', p: 'proof.png', w: 1, h: 1 }];
  expect(await parseEffectRuntimeRenderRequest(await createMessage(document))).toMatchObject({
    ok: true,
  });
  bytes[bytes.length - 1] = bytes.at(-1)! ^ 1;
  document.resources[0]!.base64 = btoa(String.fromCharCode(...bytes));
  expect(await parseEffectRuntimeRenderRequest(await createMessage(document))).toMatchObject({
    ok: false,
    failure: { code: 'inputRejected' },
  });
});

it('rejects detached assets and closes every discoverable bitmap on malformed envelopes', async () => {
  const message = await createMessage();
  expect(
    await parseEffectRuntimeRenderRequest({
      ...message,
      assetSelectionRef: { ...message.assetSelectionRef, assets: [{}] },
    })
  ).toMatchObject({ ok: false, failure: { code: 'inputRejected' } });
  const expected = new FakeImageBitmap(1280, 720),
    unexpected = new FakeImageBitmap(8, 8);
  const malformed = {
    ...message,
    inputFrames: { source: { bitmap: expected, width: 1280, height: 720 } },
    unexpected: { nested: unexpected },
  };
  expect(await parseEffectRuntimeRenderRequest(malformed)).toMatchObject({
    ok: false,
    failure: { code: 'malformed' },
  });
  closeEffectRuntimeBitmaps(malformed);
  expect(expected.close).toHaveBeenCalledOnce();
  expect(unexpected.close).toHaveBeenCalledOnce();
});

it('admits FX density with unchanged logical extent and refuses oversized rasters', () => {
  expect(parseRenderDimensions(1280, 720, { width: 640, height: 360 })).toEqual({
    width: 1280,
    height: 720,
  });
  expect(parseRenderDimensions(100000, 100000, { width: 640, height: 360 })).toBeNull();
});
