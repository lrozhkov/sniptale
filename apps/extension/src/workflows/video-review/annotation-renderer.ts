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
} from '../../features/video/composition/effect-runtime/runtime/types';
import {
  resolveReviewAnnotationEffectBox,
  resolveReviewAnnotationEffectControls,
} from '../../features/video/review/annotation-effects/layout';
import {
  projectReviewAnnotationEffect,
  sampleReviewAnnotationEffect,
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
  const dispose = () => {
    if (disposed) return;
    disposed = true;
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
  const describe = (time: number, density: Record<Plane, Size>, fps: number) => {
    if (disposed || !captured) throw new Error('Annotation renderer is disposed.');
    const current = captured;
    if (!current.lane.enabled) return [];
    return [...current.lane.instances]
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
  return {
    describe,
    counters: ledger.snapshot,
    dispose,
    /** Caller retains this batch only until painting; release closes every bitmap exactly once. */
    async render(time: number, density: Record<Plane, Size>, fps: number, signal: AbortSignal) {
      signal.throwIfAborted();
      if (active) throw new Error('Annotation bitmap batch is already admitted.');
      const planned = describe(time, density, fps);
      active = true;
      const frameReservations: { release(): void }[] = [];
      let frames: EffectRuntimeRenderedFrameMap | undefined;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        if (frames) for (const frame of frames.values()) closeEffectRuntimeBitmap(frame.bitmap);
        for (const reservation of frameReservations.splice(0)) reservation.release();
        releases.delete(release);
        active = false;
      };
      const abort = () => {
        executor?.dispose();
        executor = undefined;
      };
      signal.addEventListener('abort', abort, { once: true });
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
        };
      } catch (error) {
        release();
        throw error;
      } finally {
        signal.removeEventListener('abort', abort);
      }
    },
  };
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
