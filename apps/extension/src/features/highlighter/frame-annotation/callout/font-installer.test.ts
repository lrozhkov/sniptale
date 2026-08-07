// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

vi.mock('@sniptale/platform/browser/runtime', () => ({
  runtimeInfo: { getURL: (path: string) => `chrome-extension://test/${path}` },
}));
import {
  type FrameCalloutFontFace,
  type FrameCalloutFontOwner,
  installFrameCalloutHandwrittenFont,
} from './font-installer';

function createOwner(add = vi.fn()): FrameCalloutFontOwner {
  return { fonts: { add } };
}

function createFace(load: () => Promise<FrameCalloutFontFace>): FrameCalloutFontFace {
  return { load };
}

it('installs both bundled subsets once per owner document', async () => {
  const add = vi.fn();
  const owner = createOwner(add);
  const face = createFace(async () => face);
  const load = vi.spyOn(face, 'load');
  const createFontFace = vi.fn(() => face);
  const fetchAsset = vi.fn(async () => new ArrayBuffer(1));
  const dependencies = {
    createFace: createFontFace,
    fetchAsset,
    resolveAssetUrl: (path: string) => `chrome-extension://test/${path}`,
  };

  const first = installFrameCalloutHandwrittenFont(owner, dependencies);
  const second = installFrameCalloutHandwrittenFont(owner, dependencies);
  expect(second).toBe(first);
  await first;

  expect(fetchAsset).toHaveBeenCalledTimes(2);
  expect(createFontFace).toHaveBeenCalledTimes(2);
  expect(load).toHaveBeenCalledTimes(2);
  expect(add).toHaveBeenCalledTimes(2);
});

it('does not poison the owner cache when installation fails', async () => {
  const owner = createOwner();
  const fetchAsset = vi
    .fn<() => Promise<ArrayBuffer>>()
    .mockRejectedValueOnce(new Error('unavailable'))
    .mockResolvedValue(new ArrayBuffer(1));
  const face = createFace(async () => face);
  const load = vi.spyOn(face, 'load');
  const dependencies = {
    createFace: () => face,
    fetchAsset,
    resolveAssetUrl: (path: string) => path,
  };

  await expect(installFrameCalloutHandwrittenFont(owner, dependencies)).rejects.toThrow(
    'unavailable'
  );
  await expect(installFrameCalloutHandwrittenFont(owner, dependencies)).resolves.toBeUndefined();
  expect(load).toHaveBeenCalledTimes(2);
});

it('loads the bundled assets through the production browser adapters', async () => {
  const owner = createOwner();
  const load = vi.fn(async function (this: FrameCalloutFontFace) {
    return this;
  });
  const FontFaceStub = vi.fn(function () {
    return createFace(load);
  });
  const arrayBuffer = vi.fn(async () => new ArrayBuffer(1));
  vi.stubGlobal('FontFace', FontFaceStub);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer }))
  );

  await installFrameCalloutHandwrittenFont(owner);

  expect(FontFaceStub).toHaveBeenCalledTimes(2);
  expect(arrayBuffer).toHaveBeenCalledTimes(2);
});

it('rejects an unsuccessful bundled font response', async () => {
  const owner = createOwner();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 404 }))
  );

  await expect(installFrameCalloutHandwrittenFont(owner)).rejects.toThrow(
    'Frame annotation font request failed (404)'
  );
});
