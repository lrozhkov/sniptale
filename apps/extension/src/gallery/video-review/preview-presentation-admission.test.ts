// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { createPresentationAdmission } from './preview-presentation-admission';
import type { Description } from './preview-presentation-state';

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
