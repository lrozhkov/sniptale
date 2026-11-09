import type { GpuPreviewLayer } from '../../features/video/composition/canvas/gpu-preview';
import { prepareEffectRuntimeGpuFramePlans } from '../../features/video/composition/effect-runtime/runtime/gpu-driver';
import { createEffectRuntimeGpuFrameLedger } from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import {
  resolveEffectV1ObjectRenderBounds,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';
import type { EffectRuntimeSandboxExecutor } from '../../contracts/effect-runtime/types';
import type { RenderResources } from '../../features/video/composition/canvas/render-resources';
import { renderEffectRuntimeFramePlans } from '../../features/video/composition/effect-runtime/runtime/driver';
import {
  closeEffectRuntimeBitmap,
  createEffectRuntimeCompositionResourceLedger,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';
import type {
  EffectRuntimeFramePlan,
  EffectRuntimeRenderedFrameMap,
  EffectRuntimeGpuPreparedFrame,
} from '../../features/video/composition/effect-runtime/runtime/types';
import {
  resolveReviewAnnotationEffectBox,
  resolveReviewAnnotationEffectControls,
} from '../../features/video/review/annotation-effects/layout';
import {
  projectReviewAnnotationEffect,
  sampleReviewAnnotationEffect,
  resolveUpcomingReviewAnnotationEffectSlice,
} from '../../features/video/review/annotation-effects/timing';
import {
  reviewAnnotationEffectMatchesDocument,
  verifyReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/validation';
import type {
  ReviewAnnotationEffect,
  ReviewAnnotationEffects,
  ReviewAnnotationEffectSnapshot,
} from '../../features/video/review/annotation-effects/types';
import type { ReviewTimeSegment } from '../../features/video/review/time-segment';
import { createEffectRuntimeSandboxExecutor } from '../video/effect-runtime-sandbox';

type Size = { width: number; height: number };
type Plane = ReviewAnnotationEffect['attachment'];
/** JSON-only scene capture shared by preview, normal/presentation export and probes. */
export interface ReviewAnnotationScene {
  lane: ReviewAnnotationEffects;
  snapshots: readonly ReviewAnnotationEffectSnapshot[];
  segments: readonly ReviewTimeSegment[];
  planes: Record<Plane, Size>;
}
type Definition = Awaited<ReturnType<typeof verifyReviewAnnotationEffectSnapshot>>;

/** Uses the complete main clock and SDK geometry before any sandbox or bitmap acquisition. */
export function planReviewAnnotationFrame(args: {
  snapshot: ReviewAnnotationEffectSnapshot;
  document: EffectV1Document;
  instance: ReviewAnnotationEffect;
  segments: readonly ReviewTimeSegment[];
  time: number;
  plane: Size;
  density: Size;
  fps: number;
}) {
  const { instance, document, plane } = args;
  if (
    ![plane.width, plane.height, args.density.width, args.density.height, args.fps].every(
      (value) => Number.isFinite(value) && value > 0
    ) ||
    !Number.isFinite(args.time)
  )
    throw new Error('Annotation raster inputs are unavailable.');
  if (!instance.enabled) return null;
  if (!reviewAnnotationEffectMatchesDocument(instance, document))
    throw new Error('Annotation controls are unavailable.');
  const clock = sampleReviewAnnotationEffect(
    projectReviewAnnotationEffect(instance, args.segments),
    document.duration,
    args.time
  );
  if (!clock) return null;
  const box = resolveReviewAnnotationEffectBox(instance.transform, plane);
  const controls = resolveReviewAnnotationEffectControls(document, instance, plane);
  const layout = document.objectLayout;
  const local =
    layout?.resize === 'reflow' ? { ...layout, width: box.width, height: box.height } : layout;
  const bounds = local
    ? resolveEffectV1ObjectRenderBounds(local, controls)
    : { x: 0, y: 0, ...plane };
  const body = local ?? plane;
  const bitmapBounds = {
    x: bounds.x / body.width,
    y: bounds.y / body.height,
    width: bounds.width / body.width,
    height: bounds.height / body.height,
  };
  // Scale graphs keep native bounds in logical space. The worker's existing raster
  // transform supplies independent physical density; authored aspect must not be
  // fitted a second time by its uniform object-layout transform.
  const dimensions =
    layout?.resize === 'scale'
      ? { width: bounds.width, height: bounds.height }
      : { width: box.width * bitmapBounds.width, height: box.height * bitmapBounds.height };
  const renderDimensions = {
    width: Math.max(1, Math.ceil(box.width * bitmapBounds.width * args.density.width)),
    height: Math.max(1, Math.ceil(box.height * bitmapBounds.height * args.density.height)),
  };
  const plan: EffectRuntimeFramePlan = {
    assets: [],
    bitmapBounds,
    controls,
    dimensions,
    renderDimensions,
    documentSha256: args.snapshot.sha256,
    documentSource: args.snapshot.source,
    duration: document.duration,
    effectInstanceId: instance.id,
    fps: args.fps,
    frameIndex: Math.max(0, Math.floor(clock.time * args.fps)),
    kind: 'standalone',
    progress: clock.progress,
    time: clock.time,
    snapshotId: args.snapshot.id,
    target: { kind: 'scene', clipId: instance.id },
  };
  return { instance, box, bitmapBounds, plan };
}

/** Exact declared retained bytes for admission; verification still checks actual source and resource bytes. */
export function reviewAnnotationPreparationBytes(scene: ReviewAnnotationScene) {
  if (!scene.lane.enabled) return 0;
  const ids = new Set(
    scene.lane.instances
      .filter((instance) => instance.enabled)
      .map((instance) => instance.snapshotId)
  );
  return scene.snapshots
    .filter((snapshot) => ids.has(snapshot.id))
    .reduce((sum, snapshot) => sum + snapshot.retainedByteLength, 0);
}

/** One prepared renderer owns verified bytes, sandbox and at most one admitted bitmap batch; no queue. */
export async function createReviewAnnotationRenderer(
  scene: ReviewAnnotationScene,
  deps: {
    resources: RenderResources;
    readAsset(reference: string, signal: AbortSignal): Promise<Blob | null>;
    signal: AbortSignal;
    createExecutor?: () => EffectRuntimeSandboxExecutor;
    createWarmExecutor?: () => EffectRuntimeSandboxExecutor | undefined;
  }
) {
  const ids = scene.lane.enabled
    ? new Set(
        scene.lane.instances
          .filter((instance) => instance.enabled)
          .map((instance) => instance.snapshotId)
      )
    : new Set<string>();
  let captured: ReviewAnnotationScene | undefined = structuredClone({
    lane: {
      enabled: scene.lane.enabled,
      instances: scene.lane.instances.filter(
        (instance) => ids.has(instance.snapshotId) && instance.enabled
      ),
    },
    snapshots: scene.snapshots.filter((snapshot) => ids.has(snapshot.id)),
    segments: scene.segments,
    planes: scene.planes,
  });
  const definitions = new Map<string, Definition>();
  const reservations: { release(): void }[] = [];
  const ledger = createEffectRuntimeCompositionResourceLedger();
  let executor: EffectRuntimeSandboxExecutor | undefined;
  let disposed = false;
  let active = false;
  const releases = new Set<() => void>();
  let warm:
    | {
        controller: AbortController;
        executor: EffectRuntimeSandboxExecutor;
        closed: boolean;
        start: number;
        frames: ReadonlyMap<string, EffectRuntimeGpuPreparedFrame> | undefined;
      }
    | undefined;
  let attempted:
    | {
        key: string;
        context: object;
        signal: AbortSignal;
        inputs: readonly object[];
        instances: readonly ReviewAnnotationEffect[];
        fps: number;
        start: number;
      }
    | undefined;
  const cancelWarm = (resetAttempt = false) => {
    if (resetAttempt) attempted = undefined;
    const flight = warm;
    warm = undefined;
    if (!flight) return;
    flight.controller.abort();
    if (flight.frames) for (const frame of flight.frames.values()) frame.dispose();
    flight.frames = undefined;
    if (!flight.closed) {
      flight.closed = true;
      flight.executor.dispose();
    }
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelWarm();
    attempted = undefined;
    executor?.dispose();
    executor = undefined;
    for (const release of releases) release();
    for (const reservation of reservations.splice(0)) reservation.release();
    definitions.clear();
    captured = undefined;
  };
  try {
    deps.signal.throwIfAborted();
    const bytes = reviewAnnotationPreparationBytes(captured);
    if (bytes) reservations.push(deps.resources.bytes('annotation-immutable-sources', bytes));
    for (const id of ids) {
      const snapshot = captured.snapshots.find((entry) => entry.id === id);
      if (!snapshot) throw new Error('Annotation snapshot is unavailable.');
      const definition = await verifyReviewAnnotationEffectSnapshot(
        snapshot,
        async (reference, signal) => (await deps.readAsset(reference, signal)) ?? undefined,
        deps.signal
      );
      deps.signal.throwIfAborted();
      definitions.set(id, definition);
    }
  } catch (error) {
    dispose();
    throw error;
  }
  const describe = (
    time: number,
    density: Record<Plane, Size>,
    fps: number,
    instances?: readonly ReviewAnnotationEffect[]
  ) => {
    if (disposed || !captured) throw new Error('Annotation renderer is disposed.');
    const current = captured;
    if (!current.lane.enabled) return [];
    return [...(instances ?? current.lane.instances)]
      .sort((a, b) => a.order - b.order)
      .flatMap((instance) => {
        if (!instance.enabled) return [];
        const definition = definitions.get(instance.snapshotId);
        if (!definition) throw new Error('Annotation snapshot is unavailable.');
        const planned = planReviewAnnotationFrame({
          snapshot: definition.snapshot,
          document: definition.document,
          instance,
          segments: current.segments,
          time,
          plane: current.planes[instance.attachment],
          density: density[instance.attachment],
          fps,
        });
        return planned
          ? [{ ...planned, plan: { ...planned.plan, assets: definition.assets } }]
          : [];
      });
  };
  type WarmGpuPreparation = {
    time: number;
    fps: number;
    context: object;
    inputs?: readonly object[];
    signal: AbortSignal;
    instances?: readonly ReviewAnnotationEffect[];
    densityAt(time: number): Record<Plane, Size>;
    prepare(
      entry: ReturnType<typeof describe>[number] & { source: GpuPreviewLayer['source'] },
      time: number
    ): Promise<void> | void;
  };
  const matchesWarmInput = (
    args: WarmGpuPreparation,
    instances: readonly ReviewAnnotationEffect[]
  ) =>
    Boolean(
      attempted &&
      attempted.context === args.context &&
      attempted.signal === args.signal &&
      attempted.instances === instances &&
      attempted.fps === args.fps &&
      attempted.inputs.length === (args.inputs?.length ?? 0) &&
      attempted.inputs.every((value, index) => value === args.inputs?.[index])
    );
  const runWarmPreparation = async (
    args: WarmGpuPreparation,
    flight: NonNullable<typeof warm>,
    entry: ReturnType<typeof describe>[number],
    time: number
  ) => {
    const cancel = () => {
      if (warm === flight) cancelWarm();
    };
    args.signal.addEventListener('abort', cancel, { once: true });
    const ledger = createEffectRuntimeGpuFrameLedger((bytes) =>
      deps.resources.bytes('annotation-warm-plan-resources', bytes)
    );
    try {
      const frames = await prepareEffectRuntimeGpuFramePlans({
        executor: flight.executor,
        plans: [entry.plan],
        ledger,
        signal: flight.controller.signal,
      });
      flight.frames = frames;
      flight.controller.signal.throwIfAborted();
      if (warm !== flight) return;
      const frame = frames.get(entry.instance.id);
      if (!frame || !('kind' in frame.source) || frame.source.kind !== 'group') return;
      const compilation = args.prepare({ ...entry, source: frame.source }, time);
      // preparePipelines captures descriptors synchronously; no bitmap stays borrowed while it compiles.
      for (const prepared of frames.values()) prepared.dispose();
      flight.frames = undefined;
      await compilation;
    } catch {
      // Advisory execution does not change the foreground session or its failure policy.
    } finally {
      if (flight.frames) for (const prepared of flight.frames.values()) prepared.dispose();
      flight.frames = undefined;
      if (!flight.closed) {
        flight.closed = true;
        flight.executor.dispose();
      }
      args.signal.removeEventListener('abort', cancel);
      if (warm === flight) warm = undefined;
    }
  };
  let gpuLedger: ReturnType<typeof createEffectRuntimeGpuFrameLedger> | undefined;
  const owner = {
    cancelWarm,
    warmUpcomingGpu(args: WarmGpuPreparation): void {
      try {
        if (
          disposed ||
          !captured ||
          !captured.lane.enabled ||
          !deps.createWarmExecutor ||
          args.signal.aborted
        )
          return;
        const instances = args.instances ?? captured.lane.instances;
        const unchanged = matchesWarmInput(args, instances);
        if (
          unchanged &&
          attempted &&
          args.time < attempted.start &&
          attempted.start <= args.time + 1
        )
          return;
        const next = resolveUpcomingReviewAnnotationEffectSlice(
          instances,
          captured.segments,
          args.time
        );
        if (!next || !(args.fps > 0) || !Number.isFinite(args.fps)) {
          cancelWarm();
          return;
        }
        // The first positive presentation tick avoids an exactly-zero authored reveal without scanning frames.
        const first = Math.ceil(next.start * args.fps) / args.fps;
        const time = first + 1 / args.fps < next.end ? first + 1 / args.fps : first;
        if (time >= next.end) return;
        const entry = describe(time, args.densityAt(time), args.fps, [next.instance])[0];
        if (!entry) return;
        const plan = entry.plan;
        const key = JSON.stringify([
          plan.documentSha256,
          plan.snapshotId,
          plan.effectInstanceId,
          plan.controls,
          plan.dimensions,
          plan.renderDimensions,
          plan.bitmapBounds,
          plan.time,
          plan.progress,
          plan.fps,
          entry.instance.attachment,
        ]);
        if (unchanged && attempted?.key === key) return;
        cancelWarm();
        attempted = {
          key,
          context: args.context,
          signal: args.signal,
          inputs: args.inputs ?? [],
          instances,
          fps: args.fps,
          start: next.start,
        };
        const isolated = deps.createWarmExecutor();
        if (!isolated?.prepareGpuFrame) {
          if (!isolated) attempted = undefined;
          isolated?.dispose();
          return;
        }
        const flight: NonNullable<typeof warm> = {
          controller: new AbortController(),
          executor: isolated,
          closed: false,
          start: next.start,
          frames: undefined,
        };
        warm = flight;
        void runWarmPreparation(args, flight, entry, time);
      } catch {
        cancelWarm();
      }
    },
    /** Unknown executors remain serial until their explicit capability is available. */
    get maximumInFlight(): 1 | 2 {
      return executor?.prepareGpuFrame && executor.maximumGpuFramesInFlight === 2 ? 2 : 1;
    },
    describe,
    counters: ledger.snapshot,
    dispose,
    async prepareGpu(
      time: number,
      density: Record<Plane, Size>,
      fps: number,
      signal: AbortSignal,
      instances?: readonly ReviewAnnotationEffect[]
    ) {
      signal.throwIfAborted();
      const planned = describe(time, density, fps, instances);
      if (warm && time >= warm.start) cancelWarm();
      executor ??= (deps.createExecutor ?? createEffectRuntimeSandboxExecutor)();
      if (!executor.prepareGpuFrame) {
        const legacy = await owner.render(time, density, fps, signal, instances);
        return {
          ...legacy,
          independent: false,
          entries: legacy.entries.map((entry) => ({ ...entry, source: entry.bitmap })),
        };
      }
      gpuLedger ??= createEffectRuntimeGpuFrameLedger(
        (bytes) => deps.resources.bytes('annotation-gpu-plan-resources', bytes),
        owner.maximumInFlight
      );
      const frames = await prepareEffectRuntimeGpuFramePlans({
        executor,
        plans: planned.map((entry) => entry.plan),
        ledger: gpuLedger,
        signal,
      });
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        releases.delete(release);
        for (const frame of frames.values()) frame.dispose();
      };
      releases.add(release);
      try {
        signal.throwIfAborted();
        if (disposed) throw new Error('Annotation renderer is disposed.');
        return {
          independent: true,
          entries: planned.map((entry) => {
            const frame = frames.get(entry.instance.id);
            if (!frame) throw new Error('Annotation GPU frame is unavailable.');
            return { ...entry, source: frame.source };
          }),
          release,
          retain() {
            if (released || disposed) throw new Error('Annotation GPU batch is released.');
            const borrows = [...frames.values()].map((frame) => frame.retain());
            return {
              release() {
                for (const borrow of borrows.splice(0)) borrow.release();
              },
            };
          },
        };
      } catch (error) {
        release();
        throw error;
      }
    },
    /** A consumer can borrow a batch through its GPU fence; disposal waits for those borrows. */
    async render(
      time: number,
      density: Record<Plane, Size>,
      fps: number,
      signal: AbortSignal,
      instances?: readonly ReviewAnnotationEffect[]
    ) {
      signal.throwIfAborted();
      if (active) throw new Error('Annotation bitmap batch is already admitted.');
      const planned = describe(time, density, fps, instances);
      active = true;
      const frameReservations: { release(): void }[] = [];
      let frames: EffectRuntimeRenderedFrameMap | undefined;
      let released = false;
      let releaseRequested = false;
      let borrowers = 0;
      const releaseWhenReady = () => {
        if (released || !releaseRequested || borrowers > 0) return;
        released = true;
        if (frames) for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
        for (const reservation of frameReservations.splice(0)) reservation.release();
        releases.delete(release);
        active = false;
      };
      const release = () => {
        releaseRequested = true;
        releaseWhenReady();
      };
      const retain = () => {
        if (releaseRequested || disposed) throw new Error('Annotation bitmap batch is released.');
        borrowers += 1;
        let returned = false;
        return {
          release() {
            if (returned) return;
            returned = true;
            borrowers -= 1;
            releaseWhenReady();
          },
        };
      };
      // A cancelled frame releases its late output; the prepared owner retains the sandbox.
      releases.add(release);
      try {
        for (const { plan } of planned)
          frameReservations.push(
            deps.resources.bytes(
              'annotation-output-bitmap',
              plan.renderDimensions.width * plan.renderDimensions.height * 4
            )
          );
        if (planned.length) {
          executor ??= (deps.createExecutor ?? createEffectRuntimeSandboxExecutor)();
          frames = await renderEffectRuntimeFramePlans({
            executor,
            plans: planned.map(({ plan }) => plan),
            inputMaterializer: {
              materializeTargetSource: async () => {
                throw new Error('Standalone annotation expected.');
              },
              materializeTransitionInputs: async () => {
                throw new Error('Standalone annotation expected.');
              },
            },
            resourceScope: ledger.createFrameScope(),
            signal,
          });
          if (released) {
            for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
            frames = undefined;
          }
        }
        signal.throwIfAborted();
        if (disposed) throw new Error('Annotation renderer is disposed.');
        return {
          entries: planned.map((entry) => {
            const frame = frames?.get(entry.instance.id);
            if (!frame) throw new Error('Annotation bitmap is unavailable.');
            if (
              frame.width !== entry.plan.renderDimensions.width ||
              frame.height !== entry.plan.renderDimensions.height
            )
              throw new Error('Annotation bitmap dimensions are unavailable.');
            return { ...entry, bitmap: frame.bitmap };
          }),
          release,
          retain,
        };
      } catch (error) {
        release();
        throw error;
      }
    },
  };
  return owner;
}

/** Draws body and external handle bounds in the chosen unprojected plane; the common scene owns clipping/projection. */
export function drawReviewAnnotationFrame(
  context: Pick<
    CanvasRenderingContext2D,
    'save' | 'restore' | 'translate' | 'rotate' | 'drawImage'
  >,
  entry: {
    instance: ReviewAnnotationEffect;
    bitmap: ImageBitmap;
    bitmapBounds: { x: number; y: number; width: number; height: number };
  },
  target: { x: number; y: number; width: number; height: number }
) {
  const { transform } = entry.instance;
  const width = transform.width * target.width,
    height = transform.height * target.height;
  context.save();
  try {
    context.translate(
      target.x + transform.x * target.width + width / 2,
      target.y + transform.y * target.height + height / 2
    );
    context.rotate(transform.rotation);
    context.drawImage(
      entry.bitmap,
      (entry.bitmapBounds.x - 0.5) * width,
      (entry.bitmapBounds.y - 0.5) * height,
      entry.bitmapBounds.width * width,
      entry.bitmapBounds.height * height
    );
  } finally {
    context.restore();
  }
}
