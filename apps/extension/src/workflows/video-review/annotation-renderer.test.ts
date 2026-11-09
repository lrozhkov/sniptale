import * as sandboxRuntime from '../video/effect-runtime-sandbox';
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
  EffectRuntimeGpuPlanResult,
  EffectRuntimeRenderCommand,
  EffectRuntimeSandboxExecutor,
} from '../../contracts/effect-runtime/types';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import { initializeReviewAnnotationEffectAnchors } from '../../features/video/review/annotation-effects/layout';
import type { ReviewAnnotationEffectSnapshot } from '../../features/video/review/annotation-effects/types';
import { buildReviewTimeMap } from '../../features/video/review/timeline';
import { projectReviewAnnotationEffect } from '../../features/video/review/annotation-effects/timing';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createEffectHostClip } from '../../features/video/project/factories/overlay-clip';
import { resolveEffectRuntimeFramePlans } from '../../features/video/composition/effect-runtime/frame/plan';
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
  const success = (
    request: EffectRuntimeRenderCommand
  ): Extract<EffectRuntimeFrameResult, { kind: 'frame' }> => {
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
    renderFrame: vi.fn<EffectRuntimeSandboxExecutor['renderFrame']>(async (request) =>
      success(request)
    ),
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
    expect(f.executor.dispose).toHaveBeenCalledTimes(kind === 'abort' ? 0 : 1);
    if (kind === 'abort') {
      (await renderer.render(6, density, 30, f.deps.signal)).release();
      expect(f.deps.createExecutor).toHaveBeenCalledOnce();
    }
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

it('keeps Gallery annotation phase and anchors in ordinary Native cut and rate intervals', async () => {
  const f = await fixture(['title', 'callout', 'corners', 'frame']);
  const plane = f.scene.planes.content;
  const segments = buildReviewTimeMap(12, [
    { id: 'cut', kind: 'cut', start: 5, end: 7, requestedStart: 5, requestedEnd: 7 },
    {
      id: 'rate',
      kind: 'speed',
      start: 7,
      end: 10,
      requestedStart: 7,
      requestedEnd: 10,
      rate: 2,
      audio: 'speed',
    },
  ]);
  for (const instance of f.scene.lane.instances) {
    const snapshot = f.scene.snapshots.find((entry) => entry.id === instance.snapshotId)!;
    const document = readReviewAnnotationEffectDocument(snapshot.source)!;
    const projection = projectReviewAnnotationEffect(instance, segments);
    const project = createEmptyVideoProject('Annotation parity', plane.width, plane.height);
    project.effectSnapshots = [{ ...snapshot, assets: [] }];
    project.effectInstances = [];
    project.clips = [];
    const playbackRate = document.duration / projection.duration;
    for (const [index, slice] of projection.slices.entries()) {
      const id = `${instance.id}:${index}`;
      const duration = slice.end - slice.start;
      const host = createEffectHostClip({
        duration,
        effectInstanceId: id,
        name: id,
        projectWidth: plane.width,
        projectHeight: plane.height,
        startTime: slice.start,
        trackId: project.tracks[0]!.id,
      });
      host.transform = {
        x: instance.transform.x * plane.width,
        y: instance.transform.y * plane.height,
        width: instance.transform.width * plane.width,
        height: instance.transform.height * plane.height,
        rotation: (instance.transform.rotation * 180) / Math.PI,
        opacity: 1,
      };
      project.clips.push(host);
      project.effectInstances.push({
        id,
        snapshotId: snapshot.id,
        enabled: instance.enabled,
        controls: instance.controls,
        kind: 'standalone',
        target: { kind: 'scene' },
        startTime: slice.start,
        duration,
        playbackRate,
        sourceStart: slice.offset * playbackRate,
        ...(instance.anchors
          ? {
              sceneAnchors: Object.fromEntries(
                Object.entries(instance.anchors).map(([key, point]) => [
                  key,
                  { x: point.x * plane.width, y: point.y * plane.height },
                ])
              ),
            }
          : {}),
      });
      for (const fraction of [0, 0.173, 0.619, 0.999]) {
        const time = slice.start + duration * fraction;
        const gallery = planReviewAnnotationFrame({
          snapshot,
          document,
          instance,
          segments,
          time,
          plane,
          density: { width: 1, height: 1 },
          fps: project.fps,
        })!;
        const native = resolveEffectRuntimeFramePlans(project, time).find(
          (entry) => entry.effectInstanceId === id
        )!;
        expect(native.time).toBeCloseTo(gallery.plan.time, 7);
        expect(native.progress).toBeCloseTo(gallery.plan.progress, 7);
        expect(native.frameIndex).toBe(gallery.plan.frameIndex);
        for (const [key, value] of Object.entries(gallery.plan.controls)) {
          if (typeof value === 'number') expect(native.controls[key]).toBeCloseTo(value, 7);
          else expect(native.controls[key]).toBe(value);
        }
        const bounds = native.bitmapBounds ?? { x: 0, y: 0, width: 1, height: 1 };
        for (const key of ['x', 'y', 'width', 'height'] as const)
          expect(bounds[key]).toBeCloseTo(gallery.bitmapBounds[key], 7);
      }
      expect(
        resolveEffectRuntimeFramePlans(project, slice.end).some(
          (entry) => entry.effectInstanceId === id
        )
      ).toBe(false);
    }
  }
});

it('updates callout anchor controls and body geometry without replacing verified resources', async () => {
  const f = await fixture(['callout']);
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  (await renderer.render(6, density, 30, f.deps.signal)).release();
  const original = f.executor.renderFrame.mock.calls[0]![0].controls;
  const instances = structuredClone(f.scene.lane.instances);
  const instance = instances[0]!;
  instance.transform.x += 0.1;
  instance.transform.width *= 0.8;
  instance.transform.rotation += 0.2;
  const anchor = Object.values(instance.anchors!)[0]!;
  anchor.x = 0.9;
  const batch = await renderer.render(6, density, 30, f.deps.signal, instances);
  expect(f.executor.renderFrame.mock.calls[1]![0].controls).not.toEqual(original);
  expect(batch.entries[0]!.instance).toEqual(instance);
  batch.release();
  expect(renderer.describe(6, density, 30)[0]!.instance.transform).toEqual(
    f.scene.lane.instances[0]!.transform
  );
  expect(f.deps.createExecutor).toHaveBeenCalledOnce();
  expect(f.executor.dispose).not.toHaveBeenCalled();
  renderer.dispose();
  expect(f.managed()).toBe(0);
});

it('defers prepared disposal and bitmap reservations until a GPU batch borrower releases after its fence', async () => {
  const f = await fixture();
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const batch = await renderer.render(6, density, 30, f.deps.signal);
  const retained = f.managed();
  const hold = batch.retain();
  const otherHold = batch.retain();
  batch.release();
  renderer.dispose();
  expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
  expect(renderer.counters().liveRasterResources).toBe(1);
  expect(f.managed()).toBeGreaterThan(0);
  expect(f.managed()).toBeLessThan(retained);
  hold.release();
  expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
  otherHold.release();
  hold.release();
  batch.release();
  expect(f.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(renderer.counters().liveRasterResources).toBe(0);
  expect(f.managed()).toBe(0);
});
it('retains the one-batch admission guard until its last GPU borrower releases', async () => {
  const f = await fixture();
  const renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  const batch = await renderer.render(6, density, 30, f.deps.signal);
  const hold = batch.retain();
  batch.release();
  await expect(renderer.render(6, density, 30, f.deps.signal)).rejects.toThrow('already admitted');
  hold.release();
  const next = await renderer.render(6, density, 30, f.deps.signal);
  next.release();
  renderer.dispose();
  expect(f.bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true);
});

it('preserves the no-argument sandbox factory for default annotation consumers', async () => {
  const f = await fixture();
  const factory = vi
    .spyOn(sandboxRuntime, 'createEffectRuntimeSandboxExecutor')
    .mockReturnValue(f.executor);
  try {
    const renderer = await createReviewAnnotationRenderer(f.scene, {
      resources: f.deps.resources,
      signal: f.deps.signal,
      readAsset: f.deps.readAsset,
    });
    const batch = await renderer.render(6, density, 30, f.deps.signal);
    expect(factory).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith();
    batch.release();
    renderer.dispose();
    expect(f.executor.dispose).toHaveBeenCalledOnce();
  } finally {
    factory.mockRestore();
  }
});

it.each([undefined, 2] as const)(
  'uses only the explicit executor capability %s after lazy initialization',
  async (maximumGpuFramesInFlight) => {
    const f = await fixture();
    const executor = {
      ...f.executor,
      ...(maximumGpuFramesInFlight ? { maximumGpuFramesInFlight } : {}),
      prepareGpuFrame: vi.fn(async (request: EffectRuntimeRenderCommand) => f.success(request)),
    };
    const renderer = await createReviewAnnotationRenderer(f.scene, {
      ...f.deps,
      createExecutor: () => executor,
    });
    expect(renderer.maximumInFlight).toBe(1);
    const first = await renderer.prepareGpu(6, density, 30, f.deps.signal);
    expect(renderer.maximumInFlight).toBe(maximumGpuFramesInFlight ?? 1);
    const borrow = first.retain();
    first.release();
    expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
    renderer.dispose();
    expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
    borrow.release();
    expect(f.bitmaps[0]!.close).toHaveBeenCalledOnce();
    expect(f.managed()).toBe(0);
  }
);

it.each([undefined, 2] as const)(
  'keeps full-size packet budgets through the last GPU borrow for executor capacity %s',
  async (maximumGpuFramesInFlight) => {
    const f = await fixture();
    const packets: { width: number; height: number; close: ReturnType<typeof vi.fn> }[][] = [];
    const executor = {
      ...f.executor,
      ...(maximumGpuFramesInFlight ? { maximumGpuFramesInFlight } : {}),
      prepareGpuFrame: async (
        request: EffectRuntimeRenderCommand
      ): Promise<EffectRuntimeGpuPlanResult> => {
        const masks = Array.from({ length: 9 }, () => ({
          width: 1904,
          height: 1072,
          close: vi.fn(),
        }));
        packets.push(masks);
        return {
          kind: 'gpu-plan',
          effectInstanceId: request.effectInstanceId,
          requestId: request.requestId,
          sequenceId: request.sequenceId,
          snapshotId: request.snapshotId,
          acknowledged: {
            documentId: request.documentRef.id,
            assetSelectionId: request.assetSelectionRef.id,
          },
          width: request.renderWidth,
          height: request.renderHeight,
          logicalWidth: request.width,
          logicalHeight: request.height,
          inputResources: {},
          rootPass: 0,
          resources: masks.map((bitmap, id) => ({
            bitmap,
            id,
            kind: 'coverage',
            width: bitmap.width,
            height: bitmap.height,
          })),
          passes: [
            {
              id: 0,
              width: request.renderWidth,
              height: request.renderHeight,
              logicalWidth: request.width,
              logicalHeight: request.height,
              operations: [],
            },
          ],
        };
      },
    };
    const renderer = await createReviewAnnotationRenderer(f.scene, {
      ...f.deps,
      createExecutor: () => executor,
    });
    const immutableBytes = f.managed();
    const first = await renderer.prepareGpu(6, density, 30, f.deps.signal);
    const borrow = first.retain();
    first.release();
    const packetBytes = 9 * 1904 * 1072 * 4;
    expect(f.managed()).toBe(immutableBytes + packetBytes);
    if (maximumGpuFramesInFlight === 2) {
      const second = await renderer.prepareGpu(7, density, 30, f.deps.signal);
      expect(f.managed()).toBe(immutableBytes + packetBytes * 2);
      second.release();
    } else {
      await expect(renderer.prepareGpu(7, density, 30, f.deps.signal)).rejects.toThrow();
    }
    expect(f.managed()).toBe(immutableBytes + packetBytes);
    renderer.dispose();
    expect(f.managed()).toBe(packetBytes);
    for (const bitmap of packets[0]!) expect(bitmap.close).not.toHaveBeenCalled();
    for (const bitmap of packets[1]!) expect(bitmap.close).toHaveBeenCalledOnce();
    borrow.release();
    expect(f.managed()).toBe(0);
    for (const packet of packets)
      for (const bitmap of packet) expect(bitmap.close).toHaveBeenCalledOnce();
  }
);

it('warms one isolated future plan and closes packet sources before asynchronous compilation settles', async () => {
  const f = await fixture();
  let finish!: () => void;
  const compile = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const warm = {
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn(
      async (request: EffectRuntimeRenderCommand): Promise<EffectRuntimeGpuPlanResult> => {
        const frame = f.success(request);
        return {
          ...frame,
          kind: 'gpu-plan',
          logicalWidth: request.width,
          logicalHeight: request.height,
          inputResources: {},
          rootPass: 0,
          resources: [
            {
              id: 0,
              kind: 'primitive',
              bitmap: frame.bitmap,
              width: frame.width,
              height: frame.height,
            },
          ],
          passes: [
            {
              id: 0,
              width: frame.width,
              height: frame.height,
              logicalWidth: request.width,
              logicalHeight: request.height,
              operations: [],
            },
          ],
        };
      }
    ),
  };
  const createWarmExecutor = vi.fn(() => warm);
  const renderer = await createReviewAnnotationRenderer(f.scene, { ...f.deps, createWarmExecutor });
  const held = f.managed(),
    context = {};
  const prepare = vi.fn(() => {
    expect(f.bitmaps[0]!.close).not.toHaveBeenCalled();
    return compile;
  });
  const densityAt = vi.fn(() => density);
  const args = { time: 1.5, fps: 30, context, signal: f.deps.signal, densityAt, prepare };
  renderer.warmUpcomingGpu(args);
  await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce());
  expect(f.bitmaps[0]!.close).toHaveBeenCalledOnce();
  expect(f.managed()).toBe(held);
  renderer.warmUpcomingGpu({ ...args, time: 1.6 });
  expect(createWarmExecutor).toHaveBeenCalledOnce();
  expect(densityAt).toHaveBeenCalledOnce();
  expect(f.executor.renderFrame).not.toHaveBeenCalled();
  expect(warm.renderFrame).not.toHaveBeenCalled();
  finish();
  renderer.dispose();
});

it('does not speculate through a custom foreground executor without an explicit warm dependency', async () => {
  const f = await fixture(),
    renderer = await createReviewAnnotationRenderer(f.scene, f.deps);
  renderer.warmUpcomingGpu({
    time: 1.5,
    fps: 30,
    context: {},
    signal: f.deps.signal,
    densityAt: () => density,
    prepare: vi.fn(),
  });
  expect(f.deps.createExecutor).not.toHaveBeenCalled();
  renderer.dispose();
});

it('cancels isolated execution before foreground admission and closes a late warm packet', async () => {
  const f = await fixture(['title', 'frame']);
  f.scene.lane.instances[1]!.start = 4;
  let deliver!: (result: EffectRuntimeGpuPlanResult) => void;
  let command!: EffectRuntimeRenderCommand;
  const warm = {
    dispose: vi.fn(),
    renderFrame: vi.fn(),
    prepareGpuFrame: vi.fn((request: EffectRuntimeRenderCommand) => {
      command = request;
      return new Promise<EffectRuntimeGpuPlanResult>((resolve) => {
        deliver = resolve;
      });
    }),
  };
  const renderer = await createReviewAnnotationRenderer(f.scene, {
    ...f.deps,
    createWarmExecutor: () => warm,
  });
  const held = f.managed(),
    prepare = vi.fn();
  renderer.warmUpcomingGpu({
    time: 3.5,
    fps: 30,
    context: {},
    signal: f.deps.signal,
    densityAt: () => density,
    prepare,
  });
  await vi.waitFor(() => expect(warm.prepareGpuFrame).toHaveBeenCalledOnce());
  const earlier = await renderer.prepareGpu(3.6, density, 30, f.deps.signal);
  expect(warm.dispose).not.toHaveBeenCalled();
  earlier.release();
  const foreground = await renderer.prepareGpu(4.1, density, 30, f.deps.signal);
  expect(warm.dispose).toHaveBeenCalledOnce();
  foreground.release();
  expect(f.managed()).toBe(held);
  const late = f.success(command);
  deliver({
    ...late,
    kind: 'gpu-plan',
    logicalWidth: command.width,
    logicalHeight: command.height,
    resources: [
      { id: 0, kind: 'primitive', bitmap: late.bitmap, width: late.width, height: late.height },
    ],
    inputResources: {},
    rootPass: 0,
    passes: [
      {
        id: 0,
        width: late.width,
        height: late.height,
        logicalWidth: command.width,
        logicalHeight: command.height,
        operations: [],
      },
    ],
  });
  await vi.waitFor(() => expect(late.bitmap.close).toHaveBeenCalledOnce());
  expect(warm.dispose).toHaveBeenCalledOnce();
  expect(prepare).not.toHaveBeenCalled();
  expect(f.managed()).toBe(held);
  renderer.dispose();
});

it('contains advisory factory failure and attempts that event only once', async () => {
  const f = await fixture(),
    createWarmExecutor = vi.fn(() => {
      throw new Error('startup');
    });
  const renderer = await createReviewAnnotationRenderer(f.scene, { ...f.deps, createWarmExecutor });
  const args = {
    time: 1.5,
    fps: 30,
    context: {},
    signal: f.deps.signal,
    densityAt: () => density,
    prepare: vi.fn(),
  };
  expect(() => renderer.warmUpcomingGpu(args)).not.toThrow();
  renderer.warmUpcomingGpu({ ...args, time: 1.7 });
  expect(createWarmExecutor).toHaveBeenCalledOnce();
  renderer.warmUpcomingGpu({ ...args, inputs: [{}] });
  expect(createWarmExecutor).toHaveBeenCalledTimes(2);
  renderer.dispose();
});
