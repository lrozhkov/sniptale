import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseEffectRuntimeRenderRequest } from './request-boundary';
import {
  parseControls,
  parseFrameDimensions,
  parseInputFrames,
  parseRenderDimensions,
  parseTiming,
} from './request-fields';
import { closeEffectRuntimeBitmaps } from '../../contracts/effect-runtime/bitmap-lifetime';
import { createDocument } from '../worker/interpreter/support.test-support';
import { createEffectRuntimeRenderMessage, FakeImageBitmap } from './request-boundary.test-support';
import { createEffectRuntimeDocumentCache } from './cache/documents';
import { createEffectRuntimeAssetSelectionCache } from './cache/asset-selections';

const createMessage = createEffectRuntimeRenderMessage;

beforeEach(() => {
  vi.stubGlobal('ImageBitmap', FakeImageBitmap);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('accepts a byte-verified document with its exact kind-owned inputs', async () => {
  const message = await createMessage('targetEffect');
  message.renderHeight = 360;
  message.renderWidth = 640;
  const bitmap = new FakeImageBitmap(640, 360);
  message.inputFrames = {
    source: { bitmap, height: 360, width: 640 },
  };

  const result = await parseEffectRuntimeRenderRequest(message);

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.request.document.kind).toBe('targetEffect');
    expect(result.request.inputFrames).toEqual(message.inputFrames);
    expect(result.request).toMatchObject({
      height: 720,
      renderHeight: 360,
      renderWidth: 640,
      width: 1280,
    });
  }
});

it('resolves acknowledged immutable refs', async () => {
  const cache = createEffectRuntimeDocumentCache();
  const assetSelectionCache = createEffectRuntimeAssetSelectionCache();
  const full = await createMessage('standalone');
  await expect(
    parseEffectRuntimeRenderRequest(full, cache, assetSelectionCache)
  ).resolves.toMatchObject({ ok: true });
  const refOnly = {
    ...full,
    assetSelectionRef: { id: full.assetSelectionRef.id },
    documentRef: { id: full.documentRef.id },
  };

  await expect(
    parseEffectRuntimeRenderRequest(refOnly, cache, assetSelectionCache)
  ).resolves.toMatchObject({ ok: true });
});

it('reports exact immutable-ref misses after cache reset', async () => {
  const cache = createEffectRuntimeDocumentCache();
  const assetSelectionCache = createEffectRuntimeAssetSelectionCache();
  const full = await createMessage('standalone');
  await parseEffectRuntimeRenderRequest(full, cache, assetSelectionCache);
  const refOnly = {
    ...full,
    assetSelectionRef: { id: full.assetSelectionRef.id },
    documentRef: { id: full.documentRef.id },
  };
  cache.clear();
  await expect(
    parseEffectRuntimeRenderRequest(refOnly, cache, assetSelectionCache)
  ).resolves.toEqual({
    failure: {
      code: 'cacheMiss',
      effectInstanceId: full.effectInstanceId,
      kind: 'error',
      missingRef: 'document',
      requestId: full.requestId,
      sequenceId: full.sequenceId,
      snapshotId: full.snapshotId,
    },
    ok: false,
  });
  await expect(
    parseEffectRuntimeRenderRequest(
      { ...full, assetSelectionRef: { id: full.assetSelectionRef.id } },
      createEffectRuntimeDocumentCache(),
      createEffectRuntimeAssetSelectionCache()
    )
  ).resolves.toMatchObject({
    failure: { code: 'cacheMiss', missingRef: 'assetSelection' },
    ok: false,
  });
});

describe('EffectV1 parent to broker request rejection', () => {
  it('rejects source/hash drift before trusting the document', async () => {
    const message = await createMessage('standalone');
    message.documentRef.source = message.documentRef.source!.replace(
      'safe-effect',
      'changed-effect'
    );

    await expect(parseEffectRuntimeRenderRequest(message)).resolves.toMatchObject({
      failure: { code: 'inputRejected', requestId: message.requestId },
      ok: false,
    });
  });
});

it('rejects malformed immutable-reference envelopes and snapshot drift', async () => {
  const message = await createMessage('standalone');

  await expect(
    parseEffectRuntimeRenderRequest({ ...message, documentRef: null })
  ).resolves.toMatchObject({ failure: { code: 'malformed' }, ok: false });
  await expect(
    parseEffectRuntimeRenderRequest({ ...message, assetSelectionRef: null })
  ).resolves.toMatchObject({ failure: { code: 'malformed' }, ok: false });
  await expect(
    parseEffectRuntimeRenderRequest({
      ...message,
      documentRef: { id: message.documentRef.id, source: 42 },
    })
  ).resolves.toMatchObject({ failure: { code: 'malformed' }, ok: false });
  await expect(
    parseEffectRuntimeRenderRequest({ ...message, snapshotId: 'effect:wrong' })
  ).resolves.toMatchObject({ failure: { code: 'inputRejected' }, ok: false });
});

it('bounds broker dimensions and timing', () => {
  expect(parseFrameDimensions(640, 360)).toEqual({ height: 360, width: 640 });
  expect(parseFrameDimensions(0, 360)).toBeNull();
  expect(parseRenderDimensions(640, 360, { height: 720, width: 1280 })).toEqual({
    height: 360,
    width: 640,
  });
  expect(parseRenderDimensions(640, 360, null)).toBeNull();
  expect(parseRenderDimensions(1920, 1080, { height: 720, width: 1280 })).toEqual({
    height: 1080,
    width: 1920,
  });

  const timing = { duration: 2, fps: 30, frameIndex: 15, progress: 0.25, time: 0.5 };
  expect(parseTiming(timing, 2)).toEqual(timing);
  for (const invalid of [
    { ...timing, duration: 3 },
    { ...timing, fps: 0 },
    { ...timing, frameIndex: 1.5 },
    { ...timing, progress: 0.4 },
    { ...timing, time: 3 },
  ]) {
    expect(parseTiming(invalid, 2)).toBeNull();
  }
});

it('bounds broker controls and unique input ownership', () => {
  const document = {
    ...createDocument([]),
    controls: [
      { defaultValue: 0.5, id: 'amount', kind: 'number' as const, max: 1, min: 0 },
      { defaultValue: 'label', id: 'label', kind: 'text' as const },
    ],
  };
  expect(parseControls({ amount: 0.75, label: 'safe' }, document)).toEqual({
    amount: 0.75,
    label: 'safe',
  });
  expect(parseControls({ amount: 2, label: 'safe' }, document)).toBeNull();
  expect(parseControls({ amount: 0.5, extra: true, label: 'safe' }, document)).toBeNull();
  expect(parseControls({ amount: 0.5, label: 'x'.repeat(4_097) }, document)).toBeNull();

  const transitionDocument = { ...createDocument([]), kind: 'transition' as const };
  const from = new FakeImageBitmap(640, 360);
  const to = new FakeImageBitmap(640, 360);
  const dimensions = { height: 360, width: 640 };
  expect(
    parseInputFrames(
      {
        from: { bitmap: from, ...dimensions },
        to: { bitmap: to, ...dimensions },
      },
      transitionDocument,
      dimensions
    )
  ).toEqual({
    from: { bitmap: from, ...dimensions },
    to: { bitmap: to, ...dimensions },
  });
  expect(
    parseInputFrames(
      {
        from: { bitmap: from, ...dimensions },
        to: { bitmap: from, ...dimensions },
      },
      transitionDocument,
      dimensions
    )
  ).toBeNull();
});

describe('EffectV1 parent to broker asset and lifetime checks', () => {
  it('rejects missing, extra, and dimension-mismatched runtime inputs', async () => {
    const target = await createMessage('targetEffect');
    await expect(parseEffectRuntimeRenderRequest(target)).resolves.toMatchObject({
      failure: { code: 'inputRejected' },
      ok: false,
    });

    const standalone = await createMessage('standalone');
    standalone.inputFrames = {
      source: {
        bitmap: new FakeImageBitmap(1280, 720) as unknown as ImageBitmap,
        height: 720,
        width: 1280,
      },
    };
    await expect(parseEffectRuntimeRenderRequest(standalone)).resolves.toMatchObject({
      failure: { code: 'inputRejected' },
      ok: false,
    });

    const transition = await createMessage('transition');
    transition.inputFrames = {
      from: {
        bitmap: new FakeImageBitmap(1280, 720) as unknown as ImageBitmap,
        height: 720,
        width: 1280,
      },
      to: {
        bitmap: new FakeImageBitmap(640, 360) as unknown as ImageBitmap,
        height: 720,
        width: 1280,
      },
    };
    await expect(parseEffectRuntimeRenderRequest(transition)).resolves.toMatchObject({
      failure: { code: 'inputRejected' },
      ok: false,
    });
  });
});

describe('EffectV1 parent to broker asset and lifetime checks', () => {
  it('rejects visual asset byte substitution despite matching metadata', async () => {
    const assetBytes = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const message = await createMessage('standalone', assetBytes);
    const forged = assetBytes.slice();
    forged[11] = 1;
    message.assetSelectionRef.assets![0]!.bytes = forged.buffer;

    await expect(parseEffectRuntimeRenderRequest(message)).resolves.toMatchObject({
      failure: { code: 'inputRejected' },
      ok: false,
    });
  });

  it('rejects unknown fields and closes every discoverable transferred bitmap', async () => {
    const message = await createMessage('targetEffect');
    const expected = new FakeImageBitmap(1280, 720);
    const unexpected = new FakeImageBitmap(8, 8);
    const malformed = {
      ...message,
      inputFrames: {
        source: { bitmap: expected, height: 720, width: 1280 },
      },
      unexpected: { nested: unexpected },
    };

    const result = await parseEffectRuntimeRenderRequest(malformed);
    expect(result).toMatchObject({ failure: { code: 'malformed' }, ok: false });
    closeEffectRuntimeBitmaps(malformed);
    expect(expected.close).toHaveBeenCalledOnce();
    expect(unexpected.close).toHaveBeenCalledOnce();
  });
});
