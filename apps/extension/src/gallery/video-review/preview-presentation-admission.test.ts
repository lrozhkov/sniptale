// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createPresentationAdmission } from './preview-presentation-admission';
import type { Description } from './preview-presentation-state';

afterEach(() => vi.unstubAllGlobals());

it('describes GPU output and retains only a retired front provider outside the current backend', () => {
  vi.stubGlobal('navigator', { gpu: {} });
  const description: Description = {
    renderer: 'gpu',
    scene: {
      source: { width: 10, height: 10 },
      background: { enabled: false },
      zoomRegions: [],
      comments: [],
      keys: [],
      clicks: [],
    },
    dimensions: { canonical: { width: 10, height: 10 }, backing: { width: 10, height: 10 } },
    sourceTime: 0,
    cameraTransform: undefined,
  };
  let retired = false;
  const front = {
    canvas: document.createElement('canvas'),
    outputKind: 'gpu-surface' as const,
    retainedProviderBytes: () => 1200,
    isRetiredProvider: () => retired,
  };
  front.canvas.width = front.canvas.height = 10;
  const admission = createPresentationAdmission(
    () => ({ playing: false, video: null }),
    () => description,
    () => 0,
    () => front
  );
  expect(admission.graph().publication).toMatchObject({
    outputKind: 'gpu-surface',
    previousFrontKind: 'gpu-surface',
    previousProviderBytes: 0,
  });
  retired = true;
  expect(admission.graph().publication.previousProviderBytes).toBe(1200);
  description.renderer = 'legacy';
  expect(admission.graph().publication).toMatchObject({
    outputKind: 'canvas2d',
    previousFrontKind: 'gpu-surface',
    previousProviderBytes: 1200,
  });
  admission.resources.dispose();
});

it('accounts for both captured frames and releases only the frame whose lease settles', () => {
  const description: Description = {
    scene: {
      source: { width: 10, height: 10 },
      background: { enabled: false },
      zoomRegions: [],
      comments: [],
      keys: [],
      clicks: [],
    },
    dimensions: { canonical: { width: 10, height: 10 }, backing: { width: 10, height: 10 } },
    sourceTime: 0,
    cameraTransform: undefined,
  };
  const admission = createPresentationAdmission(
    () => ({ playing: true, video: null }),
    () => description,
    () => 0,
    () => null
  );
  const assets = {
    headerBitmap: null,
    backgroundBitmap: null,
    watermark: null,
    previousWatermarkCache: null,
  };
  const first = admission.reserveSource(16, assets);
  const second = admission.reserveSource(24, assets);
  expect(admission.graph().admission.source).toEqual({ kind: 'video-frame', allocationBytes: 40 });
  first.release();
  expect(admission.graph().admission.source).toEqual({ kind: 'video-frame', allocationBytes: 24 });
  first.release();
  expect(admission.graph().admission.source).toEqual({ kind: 'video-frame', allocationBytes: 24 });
  second.release();
  expect(admission.graph().admission.source).toBeNull();
});
