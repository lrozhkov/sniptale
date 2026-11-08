import type { EffectRuntimeSandboxExecutor } from '../../../../contracts/effect-runtime/types';
import type {
  GpuPreviewRenderer,
  GpuPreviewLayer,
} from '../../../../features/video/composition/canvas/gpu-preview';
import { prepareEffectRuntimeGpuFramePlans } from '../../../../features/video/composition/effect-runtime/runtime/gpu-driver';
import { createEffectRuntimeGpuFrameLedger } from '../../../../features/video/composition/effect-runtime/runtime/resource-limits';
import type { EffectRuntimeGpuPreparedFrame } from '../../../../features/video/composition/effect-runtime/runtime/types';
import { resolvePreviewCompositionFrameSize } from './canvas';
import { resolveUpcomingNativeEffect, resolveUpcomingNativeEffectOnset } from './frame-plan';
import { buildNativeGpuEffectLayer } from './gpu-preview-layers';
import type { PreviewSceneRenderInput } from './types';

type Frames = ReadonlyMap<string, EffectRuntimeGpuPreparedFrame>;
type Candidate = NonNullable<ReturnType<typeof resolveUpcomingNativeEffect>>;
type Flight = {
  controller: AbortController;
  executor: EffectRuntimeSandboxExecutor;
  frames: Frames | undefined;
  onset: number;
  closed: boolean;
};
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

/** Own the nondrawing marker while the backend captures requirements from borrowed sources. */
function prepareNativeEffectPipelines(
  gpu: GpuPreviewRenderer,
  candidate: Candidate,
  frame: EffectRuntimeGpuPreparedFrame,
  signal: AbortSignal
): Promise<void> {
  const marker = new OffscreenCanvas(1, 1);
  try {
    const plane = {
      x: -128,
      y: -128,
      width: candidate.logical.width + 256,
      height: candidate.logical.height + 256,
    };
    const mask: GpuPreviewLayer = { source: marker, rect: plane, inverse: identity };
    const annotation = buildNativeGpuEffectLayer({
      layer: candidate.layer,
      frame,
      fullFrame: candidate.fullFrame,
      plane,
      mask: () => mask,
    });
    return gpu.preparePipelines!({
      output: candidate.output,
      logical: candidate.logical,
      // Foreground annotations follow scene content; keep their group non-leading without future media.
      layers: [
        { source: marker, rect: { x: 0, y: 0, width: 1, height: 1 }, inverse: identity },
        annotation,
      ],
      signal,
    });
  } finally {
    // The marker is borrowed only through synchronous descriptor capture.
    marker.width = marker.height = 0;
  }
}

function preloadNativeEffectTransport(
  input: Pick<PreviewSceneRenderInput, 'effectRuntimeExecutor'>
): void {
  try {
    const primary =
      typeof input.effectRuntimeExecutor === 'function'
        ? input.effectRuntimeExecutor()
        : input.effectRuntimeExecutor;
    primary?.preload?.();
  } catch {
    // Primary readiness failure must not prevent the isolated pipeline preparation.
  }
}

/** One actual Native provider owns one isolated advisory transaction, independently of frame leases. */
export function createNativeEffectPreparation(
  createExecutor?: (ownerDocument: Document) => EffectRuntimeSandboxExecutor
) {
  let disposed = false;
  let flight: Flight | null = null;
  let context: NonNullable<PreviewSceneRenderInput['effectPreparation']>['context'] | undefined;
  let provider: GpuPreviewRenderer | undefined;
  let dimensions = '';
  const attempted = new Set<string>();
  const releaseFrames = (current: Flight) => {
    if (current.frames) for (const frame of current.frames.values()) frame.dispose();
    current.frames = undefined;
  };
  const close = (current: Flight) => {
    releaseFrames(current);
    if (!current.closed) {
      current.closed = true;
      current.executor.dispose();
    }
  };
  const cancel = () => {
    const previous = flight;
    flight = null;
    if (previous) {
      previous.controller.abort();
      close(previous);
    }
  };
  const run = async (
    input: PreviewSceneRenderInput,
    gpu: GpuPreviewRenderer,
    candidate: Candidate,
    current: Flight
  ) => {
    const signal = input.effectPreparation!.context.signal;
    const abort = () => {
      if (flight === current) cancel();
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      current.frames = await prepareEffectRuntimeGpuFramePlans({
        executor: current.executor,
        plans: [candidate.plan],
        ledger: createEffectRuntimeGpuFrameLedger(),
        signal: current.controller.signal,
      });
      current.controller.signal.throwIfAborted();
      signal.throwIfAborted();
      if (flight !== current) return;
      const frame = current.frames.get(candidate.plan.effectInstanceId);
      if (!frame || !('kind' in frame.source) || frame.source.kind !== 'group') return;
      const compilation = prepareNativeEffectPipelines(
        gpu,
        candidate,
        frame,
        current.controller.signal
      );
      releaseFrames(current);
      await compilation;
    } catch {
      // Advisory failure never changes publication, the primary executor, or its failure budget.
    } finally {
      close(current);
      signal.removeEventListener('abort', abort);
      if (flight === current) flight = null;
    }
  };
  return {
    update(input: PreviewSceneRenderInput, gpu: GpuPreviewRenderer) {
      const preparation = input.effectPreparation;
      if (
        disposed ||
        !createExecutor ||
        !gpu.preparePipelines ||
        !preparation ||
        preparation.context.signal.aborted ||
        input.previewRenderer === 'legacy' ||
        input.previewMode === 'cache'
      ) {
        cancel();
        return;
      }
      const project = preparation.project;
      const output =
        input.previewRasterSize ?? resolvePreviewCompositionFrameSize({ ...input, project });
      if (!output) {
        cancel();
        return;
      }
      const nextDimensions = JSON.stringify([
        project.fps,
        project.width,
        project.height,
        output.width,
        output.height,
      ]);
      if (context !== preparation.context || provider !== gpu || dimensions !== nextDimensions) {
        cancel();
        attempted.clear();
        context = preparation.context;
        provider = gpu;
        dimensions = nextDimensions;
      }
      if (flight && preparation.time >= flight.onset) cancel();
      try {
        const onset = resolveUpcomingNativeEffectOnset(project, preparation.time);
        if (!onset) return;
        const key = JSON.stringify([onset.clipId, onset.effectInstanceId, onset.onset, onset.time]);
        if (attempted.has(key)) return;
        attempted.add(key);
        const candidate = resolveUpcomingNativeEffect({
          ...input,
          project,
          currentTime: preparation.time,
        });
        if (!candidate) return;
        preloadNativeEffectTransport(input);
        cancel();
        const executor = createExecutor(input.canvas.ownerDocument);
        const current: Flight = {
          controller: new AbortController(),
          executor,
          frames: undefined,
          onset: candidate.onset,
          closed: false,
        };
        flight = current;
        void run(input, gpu, candidate, current);
      } catch {
        cancel();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      attempted.clear();
    },
  };
}
