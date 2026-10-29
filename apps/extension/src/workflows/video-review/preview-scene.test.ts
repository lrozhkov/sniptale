import { expect, it } from 'vitest';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { reviewPreviewSceneKey, type PreviewScene } from './preview-scene';

function scene(): PreviewScene {
  return {
    source: { width: 1904, height: 984 },
    background: { enabled: false },
    zoomRegions: [createQuickEditZoomRegion({ id: 'camera', at: 0 })],
    comments: [],
    keys: [],
    clicks: [],
  };
}

it('retains canonical equality across persistence reordering without losing authored changes', () => {
  const input = scene();
  const key = reviewPreviewSceneKey(input);
  expect(
    reviewPreviewSceneKey({
      ...input,
      source: { height: 984, width: 1904 },
      zoomRegions: input.zoomRegions.map((region) => ({ ...region })),
    })
  ).toEqual(key);
  expect(reviewPreviewSceneKey({ ...input, source: { width: 1280, height: 720 } })).not.toEqual(
    key
  );
  expect(
    reviewPreviewSceneKey({
      ...input,
      zoomRegions: input.zoomRegions.map((region) => ({
        ...region,
        transform: { ...region.transform, scale: 2 },
      })),
    })
  ).not.toEqual(key);
  const second = createQuickEditZoomRegion({ id: 'second', at: 3 });
  expect(
    reviewPreviewSceneKey({ ...input, zoomRegions: [...input.zoomRegions, second] })
  ).not.toEqual(reviewPreviewSceneKey({ ...input, zoomRegions: [second, ...input.zoomRegions] }));
});
