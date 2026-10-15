import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  resolveEffectV1ControlDefault,
  validateEffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import {
  DEFAULT_QUICK_EDIT_PERSPECTIVE,
  quickEditSpatialTargetCamera,
} from '../../features/video/review/advanced/spatial';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSpatialRasterLayout,
  computeQuickEditSpatialWindow,
} from '../../features/video/review/advanced/scene';
import {
  projectQuickEditPoint,
  quickEditPlaneProjection,
} from '../../features/video/review/advanced/spatial-geometry';
import {
  initializeReviewAnnotationEffectAnchors,
  resolveReviewAnnotationEffectControls,
} from '../../features/video/review/annotation-effects/layout';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import type { QuickEditBackgroundSettings } from '../../features/video/review/advanced/types';
import {
  createReviewAnnotationGeometry,
  reviewAnnotationPlanePoint,
  reviewAnnotationBodyGeometry,
  convertReviewAnnotationAttachment,
  changeReviewAnnotationBoundControl,
  previewReviewAnnotationDrag,
} from './annotation-effects-geometry';

const source = { width: 640, height: 360 };
const output = { width: 1280, height: 720 };
const camera = { scale: 2, centerX: 0.5, centerY: 0.5 };
const transform = { x: 0.3, y: 0.3, width: 0.3, height: 0.2, rotation: 0.15 };
function builtin(name: string) {
  const raw: unknown = JSON.parse(
    readFileSync(
      `apps/extension/public/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`,
      'utf8'
    )
  );
  const result = validateEffectV1Document(raw);
  if (!result.ok || !result.document) throw new Error('Invalid builtin fixture');
  return result.document;
}
function instance(document = builtin('callout')): ReviewAnnotationEffect {
  const values = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'en')])
  );
  const bound = new Set(
    document.objectLayout?.handles?.flatMap((handle) => [handle.xControl, handle.yControl])
  );
  const anchors = initializeReviewAnnotationEffectAnchors(document, transform, values, source);
  return {
    id: 'callout',
    snapshotId: 'source',
    enabled: true,
    start: 0,
    end: 4,
    order: 0,
    attachment: 'content',
    transform,
    controls: Object.fromEntries(Object.entries(values).filter(([id]) => !bound.has(id))),
    ...(anchors ? { anchors } : {}),
  };
}
function closePoint(
  actual: { x: number; y: number } | null | undefined,
  expected: { x: number; y: number }
) {
  expect(actual?.x).toBeCloseTo(expected.x, 8);
  expect(actual?.y).toBeCloseTo(expected.y, 8);
}

it('uses canonical source/output pixels for zoom and keeps viewport pointers independent of the camera', () => {
  const geometry = createReviewAnnotationGeometry({
    source,
    output,
    camera,
    background: { enabled: false },
  })!;
  expect(geometry.contentToViewport).toEqual([4, 0, -640, 0, 4, -360, 0, 0, 1]);
  closePoint(reviewAnnotationPlanePoint(geometry, 'content', { x: 320, y: 180 }), {
    x: 240,
    y: 135,
  });
  closePoint(reviewAnnotationPlanePoint(geometry, 'viewport', { x: 320, y: 180 }), {
    x: 320,
    y: 180,
  });
  expect(
    createReviewAnnotationGeometry({
      source,
      output: { width: 0, height: 720 },
      camera,
      background: { enabled: false },
    })
  ).toBeNull();
});

it.each(['window', 'content', 'fixed', 'follow-video'] as const)(
  'matches the painter raster affine and projective window for %s and header/padding',
  (zoomBehavior) => {
    const background: QuickEditBackgroundSettings = {
      enabled: true,
      type: 'solid',
      color: '#888888',
      layout: { padding: 16, cornerRadius: 12 },
      zoomBehavior,
    };
    const region = {
      ...createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2, endMax: 4 }),
      transform: camera,
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: -45 },
    };
    const input = {
      source,
      output,
      camera: quickEditSpatialTargetCamera(region),
      background,
      windowHeader: DEFAULT_WINDOW_HEADER,
    };
    const geometry = createReviewAnnotationGeometry(input)!;
    const layout = computeQuickEditSceneLayout(input);
    const raster = computeQuickEditSpatialRasterLayout(layout, background);
    const projection = quickEditPlaneProjection(
      layout.windowRect,
      computeQuickEditSpatialWindow(layout, background),
      layout.spatial!
    );
    for (const point of [
      { x: 240, y: 140 },
      { x: 400, y: 240 },
    ]) {
      const painted = projectQuickEditPoint(projection, {
        x: raster.videoTransform.x + (point.x / source.width) * raster.videoTransform.width,
        y: raster.videoTransform.y + (point.y / source.height) * raster.videoTransform.height,
      })!;
      closePoint(projectQuickEditPoint(geometry.contentToViewport, point), painted);
      closePoint(reviewAnnotationPlanePoint(geometry, 'content', painted), point);
    }
  }
);

it('preserves a rotated visible box and external fixed anchors through affine attachment round-trip', () => {
  const document = builtin('callout');
  const original = instance(document);
  const geometry = createReviewAnnotationGeometry({
    source,
    output,
    camera,
    background: { enabled: false },
  })!;
  const converted = convertReviewAnnotationAttachment(original, 'viewport', geometry)!;
  const before = reviewAnnotationBodyGeometry(original, document, geometry)!;
  const after = reviewAnnotationBodyGeometry(converted, document, geometry)!;
  before.corners.forEach((point, index) => closePoint(after.corners[index], point));
  before.handles.forEach((handle, index) => closePoint(after.handles[index]?.point, handle.point!));
  const restored = convertReviewAnnotationAttachment(converted, 'content', geometry)!;
  for (const key of ['x', 'y', 'width', 'height', 'rotation'] as const)
    expect(restored.transform[key]).toBeCloseTo(original.transform[key], 8);
  const moved = {
    ...original,
    transform: { ...original.transform, x: original.transform.x + 0.1 },
  };
  expect(reviewAnnotationBodyGeometry(moved, document, geometry)?.handles).toEqual(before.handles);
});

it('retains perspective gestures and admits local attachment flattening before and after tilt removal', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2, endMax: 4 }),
    transform: camera,
    perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: -45 },
  };
  const tilted = createReviewAnnotationGeometry({
    source,
    output,
    camera: quickEditSpatialTargetCamera(region),
    background: { enabled: false },
  })!;
  const document = builtin('callout');
  const original = instance(document);
  expect(reviewAnnotationBodyGeometry(original, document, tilted)).not.toBeNull();
  expect(convertReviewAnnotationAttachment(original, 'viewport', tilted)).not.toBeNull();
  const flat = createReviewAnnotationGeometry({
    source,
    output,
    camera,
    background: { enabled: false },
  })!;
  expect(convertReviewAnnotationAttachment(original, 'viewport', flat)).not.toBeNull();
});

it('bound numeric controls move only their fixed anchor and do not create control overrides', () => {
  const document = builtin('callout');
  const original = instance(document);
  const geometry = createReviewAnnotationGeometry({
    source,
    output,
    camera,
    background: { enabled: false },
  })!;
  const handle = document.objectLayout?.handles?.[0];
  if (!handle) throw new Error('Missing fixed handle fixture');
  const controls = resolveReviewAnnotationEffectControls(document, original, source);
  const next = changeReviewAnnotationBoundControl(
    original,
    document,
    geometry,
    handle.xControl,
    123
  )!;
  const updated = { ...original, anchors: next };
  expect(updated.transform).toBe(original.transform);
  expect(updated.controls).toBe(original.controls);
  const resolved = resolveReviewAnnotationEffectControls(document, updated, source);
  expect(resolved[handle.xControl]).toBeCloseTo(123, 8);
  const yValue = controls[handle.yControl];
  if (typeof yValue !== 'number') throw new Error('Invalid numeric handle fixture');
  expect(resolved[handle.yControl]).toBeCloseTo(yValue, 8);
  expect(
    changeReviewAnnotationBoundControl(original, document, geometry, 'unknown', 123)
  ).toBeNull();
});

it.each(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners'])(
  'builds body and declared handles from the native SDK graph for %s',
  (name) => {
    const document = builtin(name);
    const authored = instance(document);
    const geometry = createReviewAnnotationGeometry({
      source,
      output,
      camera,
      background: { enabled: false },
    })!;
    const body = reviewAnnotationBodyGeometry(authored, document, geometry)!;
    expect(body.corners).toHaveLength(4);
    expect(body.handles).toHaveLength(document.objectLayout?.handles?.length ?? 0);
    const fullScene = structuredClone(document);
    delete fullScene.objectLayout;
    expect(
      reviewAnnotationBodyGeometry({ ...authored, anchors: {} }, fullScene, geometry)?.handles
    ).toEqual([]);
  }
);

it('projects independent anchors exactly in both directions while locally flattening the body', () => {
  const region = {
    ...createQuickEditZoomRegion({ id: 'focus', at: 0, duration: 2, endMax: 4 }),
    transform: camera,
    perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: true, rotateY: -45 },
  };
  const geometry = createReviewAnnotationGeometry({
    source,
    output,
    camera: quickEditSpatialTargetCamera(region),
    background: { enabled: false },
  })!;
  const original = instance();
  const changed = convertReviewAnnotationAttachment(original, 'viewport', geometry)!;
  expect(changed).toMatchObject({
    id: original.id,
    snapshotId: original.snapshotId,
    controls: original.controls,
    start: original.start,
    end: original.end,
  });
  for (const [id, anchor] of Object.entries(original.anchors!)) {
    const expected = projectQuickEditPoint(geometry.contentToViewport, {
      x: anchor.x * source.width,
      y: anchor.y * source.height,
    })!;
    closePoint(
      { x: changed.anchors![id]!.x * output.width, y: changed.anchors![id]!.y * output.height },
      expected
    );
  }
  const restored = convertReviewAnnotationAttachment(changed, 'content', geometry)!;
  for (const [id, anchor] of Object.entries(original.anchors!))
    closePoint(restored.anchors![id], anchor);
});

it('refuses an independently mapped anchor outside the persisted bounds without changing the source', () => {
  const geometry = createReviewAnnotationGeometry({
    source,
    output,
    camera,
    background: { enabled: false },
  })!;
  geometry.contentToViewport = [40, 0, 0, 0, 40, 0, 0, 0, 1];
  const original = instance();
  for (const id of Object.keys(original.anchors!)) original.anchors![id] = { x: 0.9, y: 0.9 };
  const before = structuredClone(original);
  expect(convertReviewAnnotationAttachment(original, 'viewport', geometry)).toBeNull();
  expect(original).toEqual(before);
});

it('keeps a rotated resize opposite corner fixed and rotates around the body center', () => {
  const document = builtin('frame');
  const original = instance(document);
  const geometry = createReviewAnnotationGeometry({
    source,
    output,
    camera,
    background: { enabled: false },
  })!;
  const before = reviewAnnotationBodyGeometry(original, document, geometry)!;
  const start = { x: 320, y: 180 };
  const resize = previewReviewAnnotationDrag({
    instance: original,
    document,
    geometry,
    start,
    point: { x: start.x + 20, y: start.y + 10 },
    kind: 'resize',
  })!;
  const after = reviewAnnotationBodyGeometry({ ...original, ...resize }, document, geometry)!;
  closePoint(after.corners[0], before.corners[0]!);
  expect(after.box.width).toBeGreaterThan(before.box.width);
  const center = {
    x: (transform.x + transform.width / 2) * source.width,
    y: (transform.y + transform.height / 2) * source.height,
  };
  const rotated = previewReviewAnnotationDrag({
    instance: original,
    document,
    geometry,
    start: { x: center.x + 20, y: center.y },
    point: { x: center.x, y: center.y + 20 },
    kind: 'rotate',
  })!;
  expect(rotated.transform?.rotation).toBeCloseTo(transform.rotation + Math.PI / 2, 8);
  expect(rotated.transform).toMatchObject({ x: transform.x, y: transform.y });
  expect(original.transform).toEqual(transform);
});
