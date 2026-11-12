import { createGlTransitionGpu, loadLocalGlTransitionAsset } from './gl-transition';
import { GpuPreviewDeviceError } from './gpu-preview-device-error';
export { GpuPreviewDeviceError } from './gpu-preview-device-error';
import { createGpuPreviewSlot } from './gpu-preview-slot';
import { createGpuPreviewPresentationOwner } from './gpu-preview-presentation';
import {
  MAX_TEXTURE_BYTES,
  validateGpuPreviewFrame,
  omitLeadingGroupCopies,
  type PreviewPipelineVariant,
  type GpuPreviewRequest,
} from './gpu-preview-plan';
export { GPU_PREVIEW_LIMITS, GPU_PREVIEW_UNIFORM_BYTES } from './gpu-preview-plan';
import { gpuPreviewShader } from './gpu-preview-shaders';
import type { GpuPreviewRenderer } from './gpu-preview-types';
export type {
  GpuPreviewGroup,
  GpuPreviewLayer,
  GpuPreviewRenderer,
  GpuPreviewPresentationSurface,
} from './gpu-preview-types';
type Reservation = { release(): void };
function createPreviewPipelineCache(device: GPUDevice, format: GPUTextureFormat) {
  const modules = new Map<string, GPUShaderModule>();
  const pipelines = new Map<string, Promise<GPURenderPipeline>>();
  const components: GPUBlendComponent[] = [
    { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    { srcFactor: 'one', dstFactor: 'one' },
    { srcFactor: 'zero', dstFactor: 'src-alpha' },
    { srcFactor: 'zero', dstFactor: 'one-minus-src-alpha' },
  ];
  const blends: GPUBlendState[] = [
    ...components.map((blend): GPUBlendState => ({ color: blend, alpha: blend })),
    {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
    },
    {
      color: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
      alpha: { srcFactor: 'dst-alpha', dstFactor: 'one-minus-src-alpha' },
    },
  ];
  return async (variants: ReadonlyMap<string, PreviewPipelineVariant>) => {
    const required = [...variants].map(async ([key, variant]) => {
      let pipeline = pipelines.get(key);
      if (!pipeline) {
        const { blend: _blend, ...shader } = variant;
        const shaderKey = JSON.stringify(shader);
        let module = modules.get(shaderKey);
        if (!module) {
          module = device.createShaderModule({
            code: gpuPreviewShader(variant.external, variant.effects, variant.masked, {
              clip: variant.clip,
              tint: variant.tint,
            }),
          });
          modules.set(shaderKey, module);
        }
        const blend = blends[variant.blend];
        if (!blend) throw new Error('GPU preview blend is unavailable.');
        pipeline = device
          .createRenderPipelineAsync({
            layout: 'auto',
            vertex: { module, entryPoint: 'vertex' },
            fragment: { module, entryPoint: 'fragment', targets: [{ format, blend }] },
            primitive: { topology: 'triangle-list' },
          })
          .catch((error: unknown) => {
            if (
              typeof GPUPipelineError !== 'undefined' &&
              error instanceof GPUPipelineError &&
              error.reason === 'internal'
            )
              throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', {
                cause: error,
              });
            throw error;
          });
        pipelines.set(key, pipeline);
      }
      return pipeline.then((value) => [key, value] as const);
    });
    return new Map(await Promise.all(required));
  };
}

function assertPresentationLimits(args: {
  maximumPresentationSurfaces?: number;
  maximumPresentationBytes?: number;
}) {
  if (
    args.maximumPresentationSurfaces !== undefined &&
    (!Number.isSafeInteger(args.maximumPresentationSurfaces) ||
      args.maximumPresentationSurfaces < 1 ||
      args.maximumPresentationSurfaces > 8)
  )
    throw new Error('GPU preview presentation surface limit is invalid.');
  if (
    args.maximumPresentationBytes !== undefined &&
    (!Number.isSafeInteger(args.maximumPresentationBytes) ||
      args.maximumPresentationBytes < 1 ||
      args.maximumPresentationBytes > 512 * 1024 * 1024)
  )
    throw new Error('GPU preview presentation byte limit is invalid.');
}

/** Creates one isolated device; missing WebGPU returns null without changing the current preview. */
export async function createGpuPreviewRenderer(
  args: {
    reserve?: (bytes: number) => Reservation;
    /** Complete requests retain private resources until both GPU barriers settle. Defaults to one. */
    maximumInFlight?: 1 | 2;
    /** Retained destination limit, independent of GPU jobs. Integer 1–8; defaults to jobs plus one. */
    maximumPresentationSurfaces?: number;
    /** Retained destination bytes, independent of textures. Positive integer, at most 512 MiB; default 256 MiB. */
    maximumPresentationBytes?: number;
  } = {}
): Promise<GpuPreviewRenderer | null> {
  assertPresentationLimits(args);
  if (!navigator.gpu) return null;
  let device: GPUDevice;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    device = await adapter.requestDevice();
  } catch (error) {
    throw new GpuPreviewDeviceError('GPU preview device is unavailable.', { cause: error });
  }
  try {
    const format = navigator.gpu.getPreferredCanvasFormat();
    const preparePipelines = createPreviewPipelineCache(device, format);
    const sampler = device.createSampler({
      minFilter: 'linear',
      magFilter: 'linear',
      mipmapFilter: 'linear',
    });
    let disposed = false;
    let failure: Error | null = null;
    let bytes = 0;
    let destroyed = false;
    let presentation: ReturnType<typeof createGpuPreviewPresentationOwner> | null = null;
    let encodingTail: Promise<void> | null = null;
    let pendingPreparations = 0;
    type Slot = Awaited<ReturnType<typeof createSlot>>;
    const slots: { busy: boolean; value?: Slot }[] = [{ busy: false }];
    const cleanAll = () => {
      if (
        destroyed ||
        !disposed ||
        pendingPreparations > 0 ||
        slots.some((slot) => slot.busy) ||
        presentation?.pending ||
        presentation?.allocatedBytes
      )
        return;
      destroyed = true;
      for (const slot of slots) slot.value?.clean();
      void glTransitions.dispose();
      device.removeEventListener('uncapturederror', uncaptured);
      device.destroy();
    };
    // Error scopes belong to the device stack. Encoding can overlap GPU completion only after pop is invoked.
    const enterEncoding = () => {
      const wait = encodingTail;
      let finish!: () => void;
      const completion = new Promise<void>((resolve) => {
        finish = resolve;
      });
      encodingTail = completion;
      let released = false;
      return {
        wait,
        release() {
          if (released) return;
          released = true;
          if (encodingTail === completion) encodingTail = null;
          finish();
        },
      };
    };
    const uncaptured = (event: GPUUncapturedErrorEvent) => {
      failure =
        typeof GPUOutOfMemoryError !== 'undefined' && event.error instanceof GPUOutOfMemoryError
          ? new GpuPreviewDeviceError(event.error.message)
          : new Error(event.error.message);
    };
    device.addEventListener('uncapturederror', uncaptured);
    void device.lost.then((info) => {
      failure = new GpuPreviewDeviceError(info.message || 'GPU preview device was lost.');
    });

    const check = (signal: AbortSignal) => {
      signal.throwIfAborted();
      if (disposed) throw new Error('GPU preview is disposed.');
      if (failure) throw failure;
    };
    const compilePreparedVariants = async (
      variants: ReadonlyMap<string, PreviewPipelineVariant>,
      signal: AbortSignal
    ) => {
      pendingPreparations++;
      const encoding = enterEncoding();
      try {
        if (encoding.wait) await encoding.wait;
        check(signal);
        device.pushErrorScope('validation');
        let compiling: ReturnType<typeof preparePipelines>;
        let validation: Promise<GPUError | null>;
        try {
          compiling = preparePipelines(variants);
        } finally {
          try {
            validation = device.popErrorScope();
          } catch (error) {
            validation = Promise.reject(error);
          } finally {
            // Only the synchronous launch uses the device error-scope stack.
            encoding.release();
          }
        }
        const [programs, checked] = await Promise.allSettled([compiling, validation]);
        if (programs.status === 'rejected') throw programs.reason;
        if (checked.status === 'rejected') throw checked.reason;
        if (checked.value) throw new Error(checked.value.message);
        check(signal);
      } finally {
        encoding.release();
        pendingPreparations--;
        cleanAll();
      }
    };
    const drain = async () => {
      try {
        await device.queue.onSubmittedWorkDone();
      } catch (error) {
        if (failure instanceof GpuPreviewDeviceError) throw failure;
        throw new GpuPreviewDeviceError('GPU preview queue failed.', { cause: error });
      }
    };
    const reserve = (count: number): Reservation => {
      const admitted = args.reserve?.(count);
      bytes += count;
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          bytes -= count;
          admitted?.release();
        },
      };
    };
    const glTransitions = createGlTransitionGpu({
      device,
      format,
      load: loadLocalGlTransitionAsset,
      reserve,
    });
    const createSlot = () =>
      createGpuPreviewSlot({
        device,
        format,
        sampler,
        reserve,
        check,
        drain,
        preparePipelines,
        glTransitions,
      });
    slots[0]!.value = await createSlot();
    const execute = async (request: GpuPreviewRequest, outputTexture?: () => GPUTexture) => {
      check(request.signal);
      let slot = slots.find((entry) => !entry.busy);
      if (!slot && slots.length < (args.maximumInFlight ?? 1)) {
        slot = { busy: false };
        slots.push(slot);
      }
      if (!slot) throw new Error('GPU preview already has a frame in flight.');
      slot.busy = true;
      const encoding = enterEncoding();
      try {
        if (encoding.wait) await encoding.wait;
        check(request.signal);
        slot.value ??= await createSlot();
        return await slot.value.render(request, encoding.release, outputTexture);
      } finally {
        encoding.release();
        slot.busy = false;
        cleanAll();
      }
    };
    presentation = createGpuPreviewPresentationOwner({
      device,
      format,
      maximumSurfaces: args.maximumPresentationSurfaces ?? (args.maximumInFlight ?? 1) + 1,
      maximumBytes: args.maximumPresentationBytes ?? MAX_TEXTURE_BYTES,
      ...(args.reserve ? { reserve: args.reserve } : {}),
      check,
      execute: async (request, outputTexture) => {
        await execute(request, outputTexture);
      },
      onIdle: cleanAll,
      unavailable: () =>
        new GpuPreviewDeviceError('GPU preview presentation surface is unavailable.'),
    });
    const presentationOwner = presentation;
    return {
      get allocatedBytes() {
        return bytes + presentationOwner.allocatedBytes;
      },
      preparePipelines(request) {
        check(request.signal);
        let plan = validateGpuPreviewFrame(request, device.limits.maxTextureDimension2D);
        const normalized = omitLeadingGroupCopies(request);
        if (normalized !== request)
          plan = validateGpuPreviewFrame(normalized, device.limits.maxTextureDimension2D);
        return compilePreparedVariants(plan.pipelines, request.signal);
      },
      createSurface: (canvas, options) => presentationOwner.create(canvas, options),
      async render(request) {
        const bitmap = await execute(request);
        if (!bitmap) throw new Error('GPU preview bitmap output is unavailable.');
        return bitmap;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        presentationOwner.dispose();
        cleanAll();
      },
    };
  } catch (error) {
    device.destroy();
    if (
      typeof GPUPipelineError !== 'undefined' &&
      error instanceof GPUPipelineError &&
      error.reason === 'internal'
    )
      throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', { cause: error });
    throw error;
  }
}
