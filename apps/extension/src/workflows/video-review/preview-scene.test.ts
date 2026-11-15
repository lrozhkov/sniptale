import { expect, it } from 'vitest';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  createReviewPreviewSceneCapture,
  sameReviewPreviewSceneKey,
  reviewPreviewSceneKey,
  type PreviewScene,
} from './preview-scene';

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

it('does not revisit immutable native cursor points after a neighboring overlay changes', () => {
  const input = scene();
  let visits = 0;
  const point = {
    id: 'point',
    time: 0,
    x: 0.5,
    y: 0.5,
    anchor: 'movement' as const,
    interpolation: 'linear' as const,
  };
  Object.defineProperty(point, 'x', {
    enumerable: true,
    get: () => {
      visits++;
      return 0.5;
    },
  });
  const path = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      { id: 'native', start: 0, end: 4, binding: { kind: 'project' as const }, keys: [point] },
    ],
  };
  const camera = { ...input.zoomRegions[0]!, cursorFocus: { path, observed: path } };
  const neighbor = createQuickEditZoomRegion({ id: 'neighbor', at: 5 });
  const first = reviewPreviewSceneKey({ ...input, zoomRegions: [camera, neighbor] });
  const before = visits;
  expect(before).toBeGreaterThan(0);
  const next = reviewPreviewSceneKey({
    ...input,
    zoomRegions: [camera, { ...neighbor, transform: { ...neighbor.transform, scale: 2 } }],
  });
  expect(next).not.toEqual(first);
  expect(visits).toBe(before);
});

it('captures isolated camera data and invalidates authored path replacements', () => {
  const input = scene();
  const path = {
    version: 1 as const,
    mode: 'follow' as const,
    smoothing: 0.5,
    sensitivity: 0.5,
    gapPolicy: 'hold' as const,
    segments: [
      {
        id: 'native',
        start: 0,
        end: 4,
        binding: { kind: 'project' as const },
        keys: [
          {
            id: 'point',
            time: 0,
            x: 0.5,
            y: 0.5,
            anchor: 'movement' as const,
            interpolation: 'linear' as const,
          },
        ],
      },
    ],
  };
  const camera = { ...input.zoomRegions[0]!, cursorFocus: { path, observed: path } };
  input.zoomRegions = [camera];
  const capture = createReviewPreviewSceneCapture();
  const original = capture(input);
  expect(original.zoomRegions[0]!.cursorFocus!.path.segments).not.toBe(path.segments);
  expect(original.zoomRegions[0]!.cursorFocus!.path.segments).toEqual(path.segments);
  const scalar = {
    ...input,
    zoomRegions: [
      {
        ...camera,
        cursorFocus: {
          ...camera.cursorFocus,
          path: { ...path, smoothing: 0.8 },
        },
      },
    ],
  };
  const scalarSnapshot = capture(scalar);
  expect(scalarSnapshot.zoomRegions[0]!.cursorFocus!.path.smoothing).toBe(0.8);
  expect(original.zoomRegions[0]!.cursorFocus!.path.smoothing).toBe(0.5);
  expect(scalarSnapshot.zoomRegions[0]!.cursorFocus!.path.segments).toBe(
    original.zoomRegions[0]!.cursorFocus!.path.segments
  );
  expect(
    sameReviewPreviewSceneKey(reviewPreviewSceneKey(input), reviewPreviewSceneKey(scalar))
  ).toBe(false);
  const changedPath = {
    ...path,
    segments: path.segments.map((segment) => ({
      ...segment,
      keys: segment.keys.map((point) => ({ ...point, x: 0.7 })),
    })),
  };
  const replaced = {
    ...input,
    zoomRegions: [{ ...camera, cursorFocus: { path: changedPath, observed: changedPath } }],
  };
  const updated = capture(replaced);
  expect(updated.zoomRegions[0]!.cursorFocus!.path.segments[0]!.keys[0]!.x).toBe(0.7);
  expect(original.zoomRegions[0]!.cursorFocus!.path.segments[0]!.keys[0]!.x).toBe(0.5);
  expect(
    sameReviewPreviewSceneKey(reviewPreviewSceneKey(input), reviewPreviewSceneKey(replaced))
  ).toBe(false);
  input.source.width = 10;
  expect(original.source.width).toBe(1904);
});

function annotationScene(): PreviewScene {
  return {
    ...scene(),
    annotationEffects: {
      lane: { enabled: true, instances: [] },
      segments: [],
      snapshots: [
        {
          id: 'snapshot',
          schemaVersion: 'sniptale.animation.v1',
          kind: 'standalone',
          documentId: 'document',
          sha256: 'a'.repeat(64),
          source: JSON.stringify({ resource: 'payload'.repeat(16384) }),
          retainedByteLength: 114702,
          assets: [],
        },
      ],
    },
  };
}

it('compares annotation source text outside repeatedly serialized scene metadata', () => {
  const input = annotationScene();
  const first = reviewPreviewSceneKey(input);
  expect(first.content).not.toContain('payload'.repeat(128));
  const reordered = structuredClone(input);
  expect(sameReviewPreviewSceneKey(first, reviewPreviewSceneKey(reordered))).toBe(true);
  reordered.annotationEffects!.snapshots[0]!.source += ' ';
  expect(sameReviewPreviewSceneKey(first, reviewPreviewSceneKey(reordered))).toBe(false);
  expect(sameReviewPreviewSceneKey(first, reviewPreviewSceneKey(input))).toBe(true);
});

it('keeps annotation metadata source ordering and live context in scene identity', () => {
  const input = annotationScene();
  const snapshot = input.annotationEffects!.snapshots[0]!;
  const first = reviewPreviewSceneKey(input, { width: 100, height: 50 });
  expect(
    sameReviewPreviewSceneKey(first, reviewPreviewSceneKey(input, { height: 50, width: 100 }))
  ).toBe(true);
  const changed = structuredClone(input);
  changed.annotationEffects!.snapshots[0]!.assets.push({
    id: 'image',
    assetId: 'asset',
    kind: 'image',
    mimeType: 'image/png',
    byteLength: 32,
    sha256: 'b'.repeat(64),
  });
  expect(
    sameReviewPreviewSceneKey(first, reviewPreviewSceneKey(changed, { width: 100, height: 50 }))
  ).toBe(false);
  expect(
    sameReviewPreviewSceneKey(first, reviewPreviewSceneKey(input, { width: 101, height: 50 }))
  ).toBe(false);
  input.annotationEffects = {
    ...input.annotationEffects!,
    snapshots: [snapshot, { ...snapshot, id: 'other', source: 'other source' }],
  };
  const ordered = reviewPreviewSceneKey(input);
  input.annotationEffects = {
    ...input.annotationEffects,
    snapshots: [...input.annotationEffects.snapshots].reverse(),
  };
  expect(sameReviewPreviewSceneKey(ordered, reviewPreviewSceneKey(input))).toBe(false);
});
