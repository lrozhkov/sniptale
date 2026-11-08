// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import * as headers from '../../../../features/video/composition/draw/window-header';
import * as timeline from '../../../../features/video/composition/timeline/render';
import {
  createProject,
  createVideoClip,
  createImageClip,
  createShapeClip,
} from '../../../../features/video/project/timeline/project-meta.test.helpers';
import {
  capturePreviewImageResources,
  arePreviewImageResourcesCurrent,
  arePreviewImageResourcesReady,
} from './image-resources';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const project = createProject([
    createVideoClip({ id: 'video', windowHeader: DEFAULT_WINDOW_HEADER }),
    createImageClip(),
    createShapeClip({
      embeddedAsset: { assetId: 'badge', placement: { x: 0, y: 0, width: 20, height: 20 } },
    }),
  ]);
  project.sceneBackground = { kind: 'image', assetId: 'background' };
  const passes = timeline.resolveVideoCompositionRenderPasses(project, 1);
  const header = headers.windowHeaderImageKey('video', DEFAULT_WINDOW_HEADER);
  const image = document.createElement('img');
  image.src = 'blob:loaded';
  Object.defineProperties(image, {
    complete: { configurable: true, value: true },
    naturalWidth: { configurable: true, value: 100 },
  });
  const imageBank = {
    [header]: image,
    'asset-video': image,
    badge: image,
    background: image,
    unused: image,
  };
  return { input: { project, imageBank }, passes, header, image };
}
it('captures only resources from supplied passes without geometry resampling or SVG composition', () => {
  const f = fixture();
  const resolve = vi.spyOn(timeline, 'resolveVideoCompositionRenderPasses');
  const svg = vi.spyOn(headers, 'projectWindowHeaderImages');
  const resources = capturePreviewImageResources(f.input, f.passes);
  expect([...resources.bindings.keys()].sort()).toEqual(
    ['asset-video', 'background', 'badge', f.header].sort()
  );
  expect(resources.images).not.toBe(f.input.imageBank);
  expect(resources.images[f.header]).toBe(f.image);
  expect(resources.images['unused']).toBeUndefined();
  expect(arePreviewImageResourcesReady(resources)).toBe(true);
  expect(resolve).not.toHaveBeenCalled();
  expect(svg).not.toHaveBeenCalled();
  expect(f.input.imageBank['unused']).toBe(f.image);
});
it('captures effect inputs and visual endpoint resources from their supplied frames', () => {
  const f = fixture();
  const other = createProject([createImageClip({ id: 'endpoint', assetId: 'endpoint-image' })]);
  const endpoint = timeline.resolveVideoCompositionRenderPasses(other, 1).overlayFrame;
  f.passes.overlayFrame.effectInputLayers = endpoint.visualLayers;
  f.passes.visualPasses.push({ ...f.passes.visualPasses[0]!, frame: endpoint, time: 2 });
  const resources = capturePreviewImageResources(f.input, f.passes);
  expect(resources.bindings.has('endpoint-image')).toBe(true);
  expect(resources.bindings.get('endpoint-image')).toBeUndefined();
});
it('retains retired borrowed images while relevant replacement and missing arrival invalidate', () => {
  const f = fixture();
  const resources = capturePreviewImageResources(f.input, f.passes);
  expect(arePreviewImageResourcesCurrent(resources, { unrelated: f.image })).toBe(true);
  expect(
    arePreviewImageResourcesCurrent(resources, { [f.header]: document.createElement('img') })
  ).toBe(false);
  const missing = capturePreviewImageResources({ ...f.input, imageBank: {} }, f.passes);
  expect(arePreviewImageResourcesCurrent(missing, { [f.header]: f.image })).toBe(false);
  expect(resources.images[f.header]).toBe(f.image);
});
it('treats a declared pending header as unavailable and preserves completed decode failure', () => {
  const f = fixture();
  expect(
    arePreviewImageResourcesReady(
      capturePreviewImageResources({ ...f.input, imageBank: {} }, f.passes)
    )
  ).toBe(false);
  Object.defineProperty(f.image, 'complete', { configurable: true, value: false });
  const resources = capturePreviewImageResources(f.input, f.passes);
  expect(arePreviewImageResourcesReady(resources)).toBe(false);
  Object.defineProperties(f.image, { complete: { value: true }, naturalWidth: { value: 0 } });
  expect(() => arePreviewImageResourcesReady(resources)).toThrow(
    'Window header image could not be decoded.'
  );
});
it('refuses an old asset source under a matching key without breaking callers without URL declarations', () => {
  const f = fixture();
  expect(
    capturePreviewImageResources(
      { ...f.input, assetUrls: { 'asset-video': 'blob:new' } },
      f.passes
    ).bindings.get('asset-video')
  ).toBeUndefined();
  expect(capturePreviewImageResources(f.input, f.passes).bindings.get('asset-video')).toBe(f.image);
});

it('does not hide a completed header failure behind a different pending header', () => {
  const image = document.createElement('img');
  Object.defineProperties(image, { complete: { value: true }, naturalWidth: { value: 0 } });
  const resources = {
    images: { failed: image },
    bindings: new Map<string, HTMLImageElement | undefined>([
      ['pending', undefined],
      ['failed', image],
    ]),
    headers: new Set(['pending', 'failed']),
  };
  expect(() => arePreviewImageResourcesReady(resources)).toThrow(
    'Window header image could not be decoded.'
  );
});

it('waits for declared body, embedded shape and background sources and preserves unavailable fallback', () => {
  const f = fixture();
  const keys = ['asset-video', 'badge', 'background'];
  const assetUrls = Object.fromEntries(keys.map((key) => [key, 'blob:loaded']));
  for (const key of keys) {
    const bank = { ...f.input.imageBank };
    delete bank[key as keyof typeof bank];
    const resources = capturePreviewImageResources(
      { ...f.input, imageBank: bank, assetUrls },
      f.passes
    );
    expect(arePreviewImageResourcesReady(resources)).toBe(false);
  }
  const resources = capturePreviewImageResources(
    { ...f.input, imageBank: { [f.header]: f.image }, assetUrls: {} },
    f.passes
  );
  expect(arePreviewImageResourcesReady(resources)).toBe(true);
  Object.defineProperty(f.image, 'naturalWidth', { value: 0 });
  const failed = capturePreviewImageResources({ ...f.input, assetUrls }, f.passes);
  expect(() => arePreviewImageResourcesReady({ ...failed, headers: new Set() })).toThrow(
    'Preview media could not be decoded'
  );
});
