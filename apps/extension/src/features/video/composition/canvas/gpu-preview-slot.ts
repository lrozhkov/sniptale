import { createGpuPreviewGroupContents } from './gpu-preview-content';
import { createSourceImageFilterGpu } from '../../../image-filters/gpu';
import type { SourceImageFilterProgram } from '../../../image-filters/plan';
import type { createGlTransitionGpu } from './gl-transition';
import { rasterizeGpuPreviewPaint } from './gpu-preview-primitive';
import { GpuPreviewDeviceError, GpuPreviewValidationError } from './gpu-preview-device-error';
import type { GpuPreviewLayer, GpuPreviewGroup, GpuPreviewPaintSource } from './gpu-preview-types';
import { createGpuPreviewDrawBounds } from './gpu-preview-bounds';
import { createGpuPreviewFilter } from './gpu-preview-filter';
import { createGpuPreviewCssFilter } from './gpu-preview-css-filter';
import {
  MAX_TEXTURE_BYTES,
  GPU_PREVIEW_UNIFORM_BYTES as UNIFORM_BYTES,
  isGroup,
  isPaintSource,
  validSize,
  layerValues,
  previewPipelineVariant,
  previewPipelineKey,
  validateGpuPreviewFrame,
  omitLeadingGroupCopies,
  needsNativeRgbSource,
  requiresGpuPreviewFilter,
  type Raster,
  type GpuPreviewRequest,
  type PreviewPipelineVariant,
} from './gpu-preview-plan';
type Size = { width: number; height: number };
type Reservation = { release(): void };
// WebGPU IDL flag values; the DOM types omit the GPU*Usage namespace constants.
const TEXTURE_USAGE = 0x02 | 0x04 | 0x10;
const UNIFORM_USAGE = 0x08 | 0x40;
export async function createGpuPreviewSlot({
  device,
  format,
  sampler,
  reserve,
  check,
  drain,
  preparePipelines,
  glTransitions,
}: {
  glTransitions: ReturnType<typeof createGlTransitionGpu>;
  device: GPUDevice;
  format: GPUTextureFormat;
  sampler: GPUSampler;
  reserve(bytes: number): Reservation;
  check(signal: AbortSignal): void;
  drain(): Promise<void>;
  preparePipelines(
    variants: ReadonlyMap<string, PreviewPipelineVariant>
  ): Promise<Map<string, GPURenderPipeline>>;
}) {
  const surface = new OffscreenCanvas(1, 1);
  const context = surface.getContext('webgpu');
  if (!context || !('configure' in context))
    throw new GpuPreviewDeviceError('GPU preview surface is unavailable.');
  let outputReservation: Reservation | null = null;
  const uniforms: { buffer: GPUBuffer; reservation: Reservation }[] = [];
  type TextureEntry = {
    source: Raster;
    revision: object | string | number | undefined;
    paintKey?: string;
    texture: GPUTexture;
    reservation: Reservation;
    bytes: number;
  };
  const textures = new Map<string, TextureEntry>();
  const groupContents = createGpuPreviewGroupContents();
  const transitionResources: { release(): void }[] = [];
  const pendingPaintRasters: { canvas: OffscreenCanvas; reservation: Reservation }[] = [];
  const targets = new Map<
    string,
    { texture: GPUTexture; reservation: Reservation; bytes: number }
  >();
  const filter = await createGpuPreviewFilter(device, reserve).catch((error: unknown) => {
    context.unconfigure();
    if (
      typeof GPUPipelineError !== 'undefined' &&
      error instanceof GPUPipelineError &&
      error.reason === 'internal'
    )
      throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', { cause: error });
    throw error;
  });
  let cssFilter: Awaited<ReturnType<typeof createGpuPreviewCssFilter>> | null = null;
  let imageFilter: Awaited<ReturnType<typeof createSourceImageFilterGpu>> | null = null;
  const dropTexture = (key: string, entry: TextureEntry) => {
    textures.delete(key);
    entry.texture.destroy();
    entry.reservation.release();
  };
  const clean = () => {
    for (const [key, entry] of textures) dropTexture(key, entry);
    for (const entry of targets.values()) {
      entry.texture.destroy();
      entry.reservation.release();
    }
    targets.clear();
    filter.dispose();
    cssFilter?.dispose();
    imageFilter?.dispose();
    for (const entry of uniforms.splice(0)) {
      entry.buffer.destroy();
      entry.reservation.release();
    }
    context.unconfigure();
    outputReservation?.release();
    outputReservation = null;
  };
  const paintRaster = (source: GpuPreviewPaintSource, count: number) => {
    const reservation = reserve(count);
    try {
      const canvas = rasterizeGpuPreviewPaint(source);
      pendingPaintRasters.push({ canvas, reservation });
      return canvas;
    } catch (error) {
      reservation.release();
      throw error;
    }
  };
  const textureFor = (
    layer: Pick<GpuPreviewLayer, 'source' | 'cache'>,
    path: string
  ): GPUTexture => {
    if (layer.source instanceof VideoFrame || isGroup(layer.source))
      throw new Error('GPU source is not a raster.');
    const key = layer.cache?.key ?? `transient:${path}`;
    const previous = textures.get(key);
    const paintKey = isPaintSource(layer.source) ? JSON.stringify(layer.source.paint) : undefined;
    if (
      previous &&
      paintKey !== undefined &&
      previous.paintKey === paintKey &&
      previous.texture.width === layer.source.width &&
      previous.texture.height === layer.source.height
    )
      return previous.texture;
    if (
      previous &&
      layer.cache &&
      previous.source === layer.source &&
      previous.revision === layer.cache.revision &&
      previous.texture.width === layer.source.width &&
      previous.texture.height === layer.source.height
    )
      return previous.texture;
    if (previous) dropTexture(key, previous);
    validSize(layer.source, device.limits.maxTextureDimension2D);
    const count = layer.source.width * layer.source.height * 4;
    const textureBytes = [...textures.values(), ...targets.values()].reduce(
      (sum, entry) => sum + entry.bytes,
      0
    );
    if (count + textureBytes > MAX_TEXTURE_BYTES)
      throw new Error('GPU preview texture budget exceeded.');
    const reservation = reserve(count);
    let texture: GPUTexture | undefined;
    try {
      texture = device.createTexture({
        size: [layer.source.width, layer.source.height],
        format: 'rgba8unorm',
        usage: TEXTURE_USAGE,
      });
      const upload = isPaintSource(layer.source) ? paintRaster(layer.source, count) : layer.source;
      device.queue.copyExternalImageToTexture(
        { source: upload },
        { texture, premultipliedAlpha: true },
        [layer.source.width, layer.source.height]
      );
      textures.set(key, {
        source: layer.source,
        revision: layer.cache?.revision,
        ...(paintKey === undefined ? {} : { paintKey }),
        texture,
        reservation,
        bytes: count,
      });
      return texture;
    } catch (error) {
      texture?.destroy();
      reservation.release();
      throw error;
    }
  };

  /** Encode child targets before their parent pass without changing frame lifetime authority. */
  const encodeFrame = (
    request: GpuPreviewRequest,
    pipelines: ReadonlyMap<string, GPURenderPipeline>,
    nativeFrames: ReadonlySet<VideoFrame>,
    transitionPlans: ReadonlyMap<
      GpuPreviewGroup,
      {
        composition: NonNullable<GpuPreviewGroup['composition']>;
        prepared: Awaited<ReturnType<typeof glTransitions.prepare>>;
      }
    >,
    imageFilterPlans: ReadonlyMap<GpuPreviewLayer, SourceImageFilterProgram>,
    outputTexture?: () => GPUTexture
  ) => {
    const drawBounds = createGpuPreviewDrawBounds();
    const encoder = device.createCommandEncoder();
    let uniformIndex = 0;
    const renderedGroups = new Map<GpuPreviewGroup, GPUTexture>();
    const contentKey = groupContents();
    const preparedFrames = new Map<VideoFrame, GPUTexture>();
    const frameRasters = new Map<GpuPreviewLayer['source'], GPUTexture>();
    const rasterFor = (layer: Pick<GpuPreviewLayer, 'source' | 'cache'>, path: string) => {
      const previous = !layer.cache && frameRasters.get(layer.source);
      if (previous) return previous;
      const texture = textureFor(layer, path);
      if (!layer.cache) frameRasters.set(layer.source, texture);
      return texture;
    };
    const targetFor = (path: string, output: Size) => {
      let target = targets.get(path);
      if (
        target &&
        (target.texture.width !== output.width || target.texture.height !== output.height)
      ) {
        targets.delete(path);
        target.texture.destroy();
        target.reservation.release();
        target = undefined;
      }
      if (target) return target.texture;
      const count = output.width * output.height * 4;
      const textureBytes = [...textures.values(), ...targets.values()].reduce(
        (sum, entry) => sum + entry.bytes,
        0
      );
      if (textureBytes + count > MAX_TEXTURE_BYTES)
        throw new Error('GPU preview texture budget exceeded.');
      const reservation = reserve(count);
      try {
        const texture = device.createTexture({
          size: [output.width, output.height],
          format,
          usage: TEXTURE_USAGE,
        });
        targets.set(path, { texture, reservation, bytes: count });
        return texture;
      } catch (error) {
        reservation.release();
        throw error;
      }
    };
    const renderLayers = (
      layers: readonly GpuPreviewLayer[],
      output: Size,
      logical: Size,
      prefix: string,
      destination: GPUTexture,
      startIndex = 0
    ) => {
      const sources = layers.map((layer, index) => {
        const path = `${prefix}/${index + startIndex}`;
        let source: GPUTexture;
        if (isGroup(layer.source)) {
          const group = layer.source;
          source = renderedGroups.get(group) ?? targetFor(path, group.output);
          if (!renderedGroups.has(group)) {
            const transition = transitionPlans.get(group);
            if (transition) {
              const from = targetFor(`${path}/gl-from`, group.output),
                to = targetFor(`${path}/gl-to`, group.output);
              renderLayers([group.layers[0]!], group.output, group.logical, path, from);
              renderLayers([group.layers[1]!], group.output, group.logical, path, to, 1);
              transitionResources.push(
                glTransitions.encode({
                  encoder,
                  prepared: transition.prepared,
                  selection: transition.composition.selection,
                  progress: transition.composition.progress,
                  ratio: group.logical.width / group.logical.height,
                  from,
                  to,
                  destination: source,
                })
              );
            } else renderLayers(group.layers, group.output, group.logical, path, source);
            renderedGroups.set(group, source);
          }
        } else if (layer.source instanceof VideoFrame) {
          const prepared = preparedFrames.get(layer.source);
          if (prepared) source = prepared;
          else {
            if (
              !requiresGpuPreviewFilter(layer) &&
              !layer.cssFilter &&
              !imageFilterPlans.has(layer)
            )
              return device.importExternalTexture({
                source: layer.source,
              });
            const size = {
              width: layer.source.displayWidth,
              height: layer.source.displayHeight,
            };
            validSize(size, device.limits.maxTextureDimension2D);
            source = targetFor(`${path}/decoded`, size);
            renderLayers(
              [
                {
                  source: layer.source,
                  rect: { x: 0, y: 0, ...size },
                  inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1],
                },
              ],
              size,
              size,
              `${path}/decoded`,
              source
            );
          }
        } else source = rasterFor(layer, path);
        const imageFilterPlan = imageFilterPlans.get(layer);
        if (imageFilterPlan) {
          if (!imageFilter) throw new Error('GPU source image filter is unavailable.');
          source = imageFilter.encode(encoder, source, path, imageFilterPlan);
        }
        if (layer.cssFilter) {
          if (!cssFilter) throw new Error('GPU preview CSS filter is unavailable.');
          source = cssFilter.prepare(encoder, source, path, layer.cssFilter);
        }
        if (requiresGpuPreviewFilter(layer))
          source = filter.prepare(
            encoder,
            source,
            path,
            isGroup(layer.source) && !layer.cssFilter && !imageFilterPlan
              ? contentKey(layer.source)
              : undefined
          );
        return source.createView();
      });
      const masks = layers.map((layer, index) =>
        layer.alphaMask
          ? rasterFor(layer.alphaMask, `${prefix}/${index + startIndex}/alpha-mask`).createView()
          : null
      );
      const operationClips = layers.map((layer, index) =>
        layer.operationClip
          ? rasterFor(
              layer.operationClip,
              `${prefix}/${index + startIndex}/operation-clip`
            ).createView()
          : null
      );
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: destination.createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: [0, 0, 0, 0],
          },
        ],
      });
      let destinationCoverage: [number, number, number, number] = [0, 0, 0, 0];
      layers.forEach((layer, index) => {
        const slot = uniformIndex++;
        let uniform = uniforms[slot];
        if (!uniform) {
          const reservation = reserve(UNIFORM_BYTES);
          try {
            uniform = {
              buffer: device.createBuffer({ size: UNIFORM_BYTES, usage: UNIFORM_USAGE }),
              reservation,
            };
            uniforms.push(uniform);
          } catch (error) {
            reservation.release();
            throw error;
          }
        }
        const preparedNative =
          layer.source instanceof VideoFrame && preparedFrames.has(layer.source);
        const samplingLayer =
          preparedNative &&
          !requiresGpuPreviewFilter(layer) &&
          !layer.cssFilter &&
          !imageFilterPlans.has(layer)
            ? { ...layer, clampSourceEdges: ['left', 'top', 'right', 'bottom'] as const }
            : layer;
        device.queue.writeBuffer(uniform.buffer, 0, layerValues(samplingLayer, output, logical));
        const external =
          layer.source instanceof VideoFrame &&
          !preparedNative &&
          !requiresGpuPreviewFilter(layer) &&
          !layer.cssFilter &&
          !imageFilterPlans.has(layer);
        const pipeline = pipelines.get(previewPipelineKey(previewPipelineVariant(layer, external)));
        const pixels = sources[index];
        const mask = masks[index];
        if (!pipeline || !pixels) throw new Error('GPU preview pipeline is unavailable.');
        pass.setPipeline(pipeline);
        pass.setBindGroup(
          0,
          device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: { buffer: uniform.buffer } },
              { binding: 1, resource: sampler },
              { binding: 2, resource: pixels },
              ...(mask ? [{ binding: 3, resource: mask }] : []),
              ...(operationClips[index] ? [{ binding: 4, resource: operationClips[index] }] : []),
            ],
          })
        );
        const scissor = drawBounds(layer, output, logical, destinationCoverage);
        pass.setScissorRect(...scissor);
        if (layer.blend !== 'mask' && layer.blend !== 'erase' && layer.blend !== 'atop') {
          const [x, y, width, height] = destinationCoverage;
          if (width === 0 || height === 0) destinationCoverage = scissor;
          else if (scissor[2] > 0 && scissor[3] > 0) {
            const left = Math.min(x, scissor[0]),
              top = Math.min(y, scissor[1]);
            destinationCoverage = [
              left,
              top,
              Math.max(x + width, scissor[0] + scissor[2]) - left,
              Math.max(y + height, scissor[1] + scissor[3]) - top,
            ];
          }
        }
        pass.draw(3);
      });
      pass.end();
    };
    let nativeIndex = 0;
    for (const source of nativeFrames) {
      if (needsNativeRgbSource(source)) {
        const size = { width: source.displayWidth, height: source.displayHeight };
        validSize(size, device.limits.maxTextureDimension2D);
        const path = `native:${nativeIndex}`;
        const target = targetFor(path, size);
        renderLayers(
          [{ source, rect: { x: 0, y: 0, ...size }, inverse: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
          size,
          size,
          path,
          target
        );
        preparedFrames.set(source, target);
      }
      nativeIndex++;
    }
    renderLayers(
      request.layers,
      request.output,
      request.logical,
      '',
      outputTexture ? outputTexture() : context.getCurrentTexture()
    );
    return encoder.finish();
  };

  return {
    clean,
    async render(
      request: GpuPreviewRequest,
      releaseEncoding: () => void,
      outputTexture?: () => GPUTexture
    ) {
      check(request.signal);
      let plan = validateGpuPreviewFrame(request, device.limits.maxTextureDimension2D);
      const normalized = omitLeadingGroupCopies(request);
      if (normalized !== request) {
        request = normalized;
        plan = validateGpuPreviewFrame(request, device.limits.maxTextureDimension2D);
      }
      device.pushErrorScope('validation');
      let scopeOpen = true;
      let completed = false;
      try {
        const pipelines = await preparePipelines(plan.pipelines);
        const transitionPlans = new Map(
          await Promise.all(
            [...plan.glTransitions].map(
              async ([group, composition]) =>
                [
                  group,
                  { composition, prepared: await glTransitions.prepare(composition.selection) },
                ] as const
            )
          )
        );
        if (!cssFilter && plan.hasCssFilter)
          cssFilter = await createGpuPreviewCssFilter(device, reserve).catch((error: unknown) => {
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
        if (!imageFilter && plan.imageFilters.size)
          imageFilter = await createSourceImageFilterGpu(device, reserve).catch(
            (error: unknown) => {
              if (
                typeof GPUPipelineError !== 'undefined' &&
                error instanceof GPUPipelineError &&
                error.reason === 'internal'
              )
                throw new GpuPreviewDeviceError('GPU preview pipeline device failure.', {
                  cause: error,
                });
              throw error;
            }
          );
        check(request.signal);
        filter.beginFrame();
        cssFilter?.beginFrame();
        imageFilter?.beginFrame();
        if (
          !outputTexture &&
          (surface.width !== request.output.width ||
            surface.height !== request.output.height ||
            !outputReservation)
        ) {
          context.unconfigure();
          outputReservation?.release();
          outputReservation = null;
          outputReservation = reserve(request.output.width * request.output.height * 8);
          surface.width = request.output.width;
          surface.height = request.output.height;
          context.configure({ device, format, alphaMode: 'premultiplied' });
        }
        for (const [key, entry] of textures)
          if (!plan.retainedKeys.has(key)) dropTexture(key, entry);
        for (const [key, entry] of targets)
          if (!plan.targetKeys.has(key)) {
            targets.delete(key);
            entry.texture.destroy();
            entry.reservation.release();
          }
        device.queue.submit([
          encodeFrame(
            request,
            pipelines,
            plan.nativeFrames,
            transitionPlans,
            plan.imageFilters,
            outputTexture
          ),
        ]);
        request.onSubmitted?.();
        scopeOpen = false;
        // Both completions retain borrowed sources; a rejection must not release the other barrier.
        const [submitted, validation] = await Promise.allSettled([
          drain(),
          Promise.resolve().then(() => {
            try {
              return device.popErrorScope();
            } finally {
              releaseEncoding();
            }
          }),
        ]);
        if (submitted.status === 'rejected') throw submitted.reason;
        if (validation.status === 'rejected') throw validation.reason;
        const error = validation.value;
        if (error) throw new GpuPreviewValidationError(error.message, { cause: error });
        check(request.signal);
        const result = outputTexture ? undefined : surface.transferToImageBitmap();
        completed = true;
        return result;
      } finally {
        // A failed encode can still contain texture uploads; drain before borrowed frames or resources leave scope.
        try {
          if (scopeOpen) await drain();
        } finally {
          try {
            if (scopeOpen) {
              let validation: Promise<GPUError | null>;
              try {
                validation = device.popErrorScope();
              } finally {
                releaseEncoding();
              }
              await validation;
            }
          } finally {
            for (const resource of transitionResources.splice(0)) resource.release();
            for (const retained of pendingPaintRasters.splice(0)) {
              retained.canvas.width = retained.canvas.height = 0;
              retained.reservation.release();
            }
            filter.endFrame(completed);
            cssFilter?.endFrame();
            imageFilter?.endFrame();
          }
        }
      }
    },
  };
}
