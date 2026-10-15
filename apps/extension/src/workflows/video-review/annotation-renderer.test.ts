import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import {
  mapEffectV1ObjectPoint,
  resolveEffectV1ObjectRenderBounds,
  resolveEffectV1ControlDefault,
  sha256EffectV1Bytes,
} from '@sniptale/runtime-contracts/effect-v1';
import type {
  EffectRuntimeFrameResult,
  EffectRuntimeRenderCommand,
  EffectRuntimeSandboxExecutor,
} from '../../contracts/effect-runtime/types';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { initializeReviewAnnotationEffectAnchors } from '../../features/video/review/annotation-effects/layout';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import {
  createReviewAnnotationRenderer,
  drawReviewAnnotationFrame,
  planReviewAnnotationFrame,
  reviewAnnotationPreparationBytes,
  type ReviewAnnotationScene,
} from './annotation-renderer';

const density = { content: { width: 0.5, height: 0.5 }, viewport: { width: 0.5, height: 0.5 } };
async function fixture(names = ['title']) {
  const plane = { width: 1920, height: 1080 };
  const snapshots: ReviewAnnotationEffectSnapshot[] = [];
  const instances: ReviewAnnotationScene['lane']['instances'] = [];
  for (const name of names) {
    const source = readFileSync(
      `apps/extension/public/video-effects/effects/annotations/sniptale-${name}/effect.sniptale-effect.json`,
      'utf8'
    );
    const document = readReviewAnnotationEffectDocument(source)!;
    const hash = await sha256EffectV1Bytes(new TextEncoder().encode(source));
    const snapshot: ReviewAnnotationEffectSnapshot = {
      id: `effect:${hash}`,
      sha256: hash,
      source,
      documentId: document.id,
      schemaVersion: 'sniptale.effect.v1',
      kind: 'standalone',
      retainedByteLength: new TextEncoder().encode(source).byteLength,
      assets: [],
    };
    snapshots.push(snapshot);
    const layout = document.objectLayout!;
    const transform = {
      x: 0.2,
      y: 0.3,
      width: layout.width / plane.width,
      height: layout.height / plane.height,
      rotation: 0.2,
    };
    const controls = Object.fromEntries(
      document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'en')])
    );
    const anchors = initializeReviewAnnotationEffectAnchors(document, transform, controls, plane);
    for (const handle of layout.handles ?? []) {
      delete controls[handle.xControl];
      delete controls[handle.yControl];
    }
    instances.push({
      id: `instance-${name}`,
      snapshotId: snapshot.id,
      start: 2,
      end: 10,
      enabled: true,
      attachment: instances.length % 2 === 0 ? 'content' : 'viewport',
      order: instances.length,
      transform,
      controls,
      ...(anchors ? { anchors } : {}),
    });
  }
  const scene: ReviewAnnotationScene = {
    lane: { enabled: true, instances },
    snapshots,
    segments: buildReviewTimeMap(12, []),
    planes: { content: plane, viewport: plane },
  };
  let managed = 0;
  const resources = {
    canvas: vi.fn(),
    bytes: vi.fn((_role: string, count: number) => {
      managed += count;
      let released = false;
      return {
        release: vi.fn(() => {
          if (!released) {
            released = true;
            managed -= count;
          }
        }),
      };
    }),
  };
  const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn<() => void>> }[] =
    [];
  const success = (request: EffectRuntimeRenderCommand): EffectRuntimeFrameResult => {
    const bitmap = {
      width: request.renderWidth,
      height: request.renderHeight,
      close: vi.fn<() => void>(),
    };
    bitmaps.push(bitmap);
    return {
      kind: 'frame',
      bitmap,
      width: bitmap.width,
      height: bitmap.height,
      effectInstanceId: request.effectInstanceId,
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      acknowledged: {
        documentId: request.documentRef.id,
        assetSelectionId: request.assetSelectionRef.id,
      },
    };
  };
  const executor = {
    renderFrame: vi.fn(async (request: EffectRuntimeRenderCommand) => success(request)),
    dispose: vi.fn(),
  } satisfies EffectRuntimeSandboxExecutor;
  const deps = {
    resources,
    readAsset: vi.fn(async () => null),
    signal: new AbortController().signal,
    createExecutor: vi.fn(() => executor),
  };
  return { scene, deps, executor, success, bitmaps, managed: () => managed };
}

it('renders six real definitions in order through the standalone driver and closes outputs', async () => {
  const f = await fixture(['lower-third', 'title', 'chapters', 'callout', 'frame', 'corners']);
  f.scene.lane.instances.reverse();
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const held = f.managed();
  expect(held).toBe(reviewAnnotationPreparationBytes(f.scene));
  const batch = await renderer.render(6, density, 30, f.deps.signal);
  expect(f.executor.renderFrame.mock.calls.map(([request]) => request.effectInstanceId)).toEqual([
    'instance-lower-third',
    'instance-title',
    'instance-chapters',
    'instance-callout',
    'instance-frame',
    'instance-corners',
  ]);
  expect(batch.entries.map(({ instance }) => instance.attachment)).toEqual([
    'content',
    'viewport',
    'content',
    'viewport',
    'content',
    'viewport',
  ]);
  for (const [request] of f.executor.renderFrame.mock.calls) {
    expect(request).toMatchObject({
      duration: 4,
      progress: 0.5,
      time: 2,
      frameIndex: 60,
      inputFrames: {},
    });
    expect((await request.materializeImmutablePayloads()).documentSource).toContain(
      'sniptale.effect.v1'
    );
  }
  expect(renderer.counters().liveRasterResources).toBe(6);
  await expect(renderer.render(6, density, 30, f.deps.signal)).rejects.toThrow('already admitted');
  batch.release();
  batch.release();
  expect(renderer.counters()).toEqual({ liveDecodedRasterBytes: 0, liveRasterResources: 0 });
  expect(f.managed()).toBe(held);
  for (const bitmap of f.bitmaps) expect(bitmap.close).toHaveBeenCalledOnce();
  renderer.dispose();
  renderer.dispose();
  expect(f.managed()).toBe(0);
  expect(f.executor.dispose).toHaveBeenCalledOnce();
});

it('keeps the full main animation clock after cuts/speed and does not restart at a fragment boundary', async () => {
  const f = await fixture();
  f.scene.segments = buildReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 5, end: 7, requestedStart: 5, requestedEnd: 7 },
    {
      id: 'speed',
      kind: 'speed',
      start: 7,
      end: 10,
      requestedStart: 7,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const frame = await renderer.render(5.5, density, 30, f.deps.signal);
  expect(f.executor.renderFrame.mock.calls[0]![0].time).toBeCloseTo(28 / 9);
  expect(f.executor.renderFrame.mock.calls[0]![0].progress).toBeCloseTo(7 / 9);
  frame.release();
  renderer.dispose();
});

it('grows callout raster bounds past the body, and reflow dimensions use the authored body', async () => {
  const f = await fixture(['callout', 'frame']);
  const callout = f.scene.lane.instances[0]!;
  const document = readReviewAnnotationEffectDocument(f.scene.snapshots[0]!.source)!;
  const handle = document.objectLayout!.handles![0]!;
  callout.anchors = { [handle.id]: { x: -0.1, y: 0.05 } };
  const frame = f.scene.lane.instances[1]!;
  frame.transform = { ...frame.transform, width: 0.6, height: 0.3 };
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const plans = renderer.describe(6, density, 30);
  expect(plans[0]!.bitmapBounds.x).toBeLessThan(0);
  expect(plans[0]!.bitmapBounds.width).toBeGreaterThan(1);
  expect(plans[1]!.plan.dimensions).toEqual({ width: 1152, height: 324 });
  expect(plans[1]!.plan.renderDimensions).toEqual({ width: 576, height: 162 });
  renderer.dispose();
});

it('scale-body aspect and fixed handles agree with public SDK raster bounds', async () => {
  const f = await fixture(['callout']);
  const instance = f.scene.lane.instances[0]!;
  instance.transform = { x: 0.1, y: 0.2, width: 0.5, height: 0.1, rotation: 0 };
  const document = readReviewAnnotationEffectDocument(f.scene.snapshots[0]!.source)!;
  const layout = document.objectLayout!;
  const plane = f.scene.planes.content;
  const planned = planReviewAnnotationFrame({
    snapshot: f.scene.snapshots[0]!,
    document,
    instance,
    plane,
    density: density.content,
    segments: f.scene.segments,
    time: 6,
    fps: 30,
  })!;
  const bounds = resolveEffectV1ObjectRenderBounds(layout, planned.plan.controls);
  expect(planned.plan.dimensions).toEqual({ width: bounds.width, height: bounds.height });
  const { box, bitmapBounds, plan } = planned;
  for (const point of [
    { x: 0, y: 0 },
    { x: layout.width, y: layout.height },
    ...layout.handles!.map((handle) => ({
      x: Number(plan.controls[handle.xControl]),
      y: Number(plan.controls[handle.yControl]),
    })),
  ]) {
    const mapped = mapEffectV1ObjectPoint(layout, box, point);
    const painted = {
      x:
        box.x +
        bitmapBounds.x * box.width +
        ((point.x - bounds.x) / plan.dimensions.width) * bitmapBounds.width * box.width,
      y:
        box.y +
        bitmapBounds.y * box.height +
        ((point.y - bounds.y) / plan.dimensions.height) * bitmapBounds.height * box.height,
    };
    expect(painted.x).toBeCloseTo(mapped.x);
    expect(painted.y).toBeCloseTo(mapped.y);
  }
});

it.each(['enabled', 'disabled'] as const)(
  'captures only admitted sources for an %s lane and drops capture on disposal',
  async (state) => {
    const f = await fixture(['title', 'chapters']);
    const ignored = f.scene.snapshots[1]!;
    f.scene.lane.instances[1]!.enabled = false;
    if (state === 'disabled') f.scene.lane.enabled = false;
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
      const firstCapture = clone.mock.calls[0]![0] as ReviewAnnotationScene;
      expect(firstCapture.snapshots).toEqual(state === 'enabled' ? [f.scene.snapshots[0]] : []);
      expect(firstCapture.snapshots).not.toContain(ignored);
      expect(f.managed()).toBe(state === 'enabled' ? f.scene.snapshots[0]!.retainedByteLength : 0);
      renderer.dispose();
      expect(f.managed()).toBe(0);
      expect(() => renderer.describe(6, density, 30)).toThrow('disposed');
    } finally {
      clone.mockRestore();
    }
  }
);

it.each(['lane', 'instance', 'outside'] as const)(
  'does not acquire a sandbox or paint outputs for %s suppression',
  async (kind) => {
    const f = await fixture();
    if (kind === 'lane') f.scene.lane.enabled = false;
    if (kind === 'instance') f.scene.lane.instances[0]!.enabled = false;
    const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
    const batch = await renderer.render(kind === 'outside' ? 10 : 6, density, 30, f.deps.signal);
    expect(batch.entries).toEqual([]);
    expect(f.deps.createExecutor).not.toHaveBeenCalled();
    expect(f.executor.renderFrame).not.toHaveBeenCalled();
    batch.release();
    renderer.dispose();
    expect(f.managed()).toBe(0);
  }
);

it('runtime failure closes earlier successes and releases all frame reservations without fallback', async () => {
  const f = await fixture(['title', 'chapters']);
  f.executor.renderFrame.mockImplementationOnce(async (request) => f.success(request));
  f.executor.renderFrame.mockImplementationOnce(async (request) => ({
    kind: 'error',
    code: 'timeout',
    requestId: request.requestId,
    effectInstanceId: request.effectInstanceId,
    snapshotId: request.snapshotId,
    sequenceId: request.sequenceId,
  }));
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const held = f.managed();
  await expect(renderer.render(6, density, 30, f.deps.signal)).rejects.toThrow('timeout');
  expect(f.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(renderer.counters().liveRasterResources).toBe(0);
  expect(f.managed()).toBe(held);
  const retry = await renderer.render(6, density, 30, f.deps.signal);
  retry.release();
  renderer.dispose();
  expect(f.managed()).toBe(0);
});

it.each(['abort', 'dispose'] as const)(
  'late bitmap after %s cannot survive or publish',
  async (kind) => {
    const f = await fixture();
    let finish!: (result: EffectRuntimeFrameResult) => void;
    let started!: () => void;
    const waiting = new Promise<void>((resolve) => {
      started = resolve;
    });
    f.executor.renderFrame.mockImplementationOnce(
      (request) =>
        new Promise((resolve) => {
          finish = resolve;
          f.success(request);
          started();
        })
    );
    const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
    const controller = new AbortController();
    const rendering = renderer.render(6, density, 30, controller.signal);
    const rejected = expect(rendering).rejects.toThrow();
    await waiting;
    if (kind === 'abort') controller.abort();
    else renderer.dispose();
    const request = f.executor.renderFrame.mock.calls[0]![0];
    finish({
      kind: 'frame',
      bitmap: f.bitmaps[0]!,
      width: request.renderWidth,
      height: request.renderHeight,
      effectInstanceId: request.effectInstanceId,
      requestId: request.requestId,
      sequenceId: request.sequenceId,
      snapshotId: request.snapshotId,
      acknowledged: {
        documentId: request.documentRef.id,
        assetSelectionId: request.assetSelectionRef.id,
      },
    });
    await rejected;
    expect(f.bitmaps[0]!.close).toHaveBeenCalledOnce();
    expect(renderer.counters().liveRasterResources).toBe(0);
    renderer.dispose();
    expect(f.managed()).toBe(0);
  }
);

it('changed source fails verification before executor creation and releases preparation bytes', async () => {
  const f = await fixture();
  f.scene.snapshots[0]!.source += ' ';
  f.scene.snapshots[0]!.retainedByteLength++;
  await expect(createReviewAnnotationRenderer(f.scene, f.deps)).rejects.toMatchObject({
    code: 'source-integrity',
  });
  expect(f.deps.createExecutor).not.toHaveBeenCalled();
  expect(f.managed()).toBe(0);
});

it('pixel paint uses the same body centre/rotation and external bounds, without adding a body clip', async () => {
  const f = await fixture();
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const frame = await renderer.render(6, density, 30, f.deps.signal);
  const entry = frame.entries[0]!;
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  };
  const target = { x: 10, y: 20, width: 960, height: 540 };
  drawReviewAnnotationFrame(context, entry, target);
  const { transform } = entry.instance;
  expect(context.translate).toHaveBeenCalledWith(
    10 + (transform.x + transform.width / 2) * 960,
    20 + (transform.y + transform.height / 2) * 540
  );
  expect(context.rotate).toHaveBeenCalledWith(transform.rotation);
  expect(context.drawImage).toHaveBeenCalledWith(
    entry.bitmap,
    -0.5 * transform.width * 960,
    -0.5 * transform.height * 540,
    transform.width * 960,
    transform.height * 540
  );
  expect(context.restore).toHaveBeenCalledOnce();
  frame.release();
  renderer.dispose();
});
