import { withSourceImageFilterCanvas } from '../../../../apps/extension/src/features/video/composition/canvas/source-image-filter';
import {
  prepareSourceSampling,
  createPreparedSourceBudget,
  preparedSourceGpuLayers,
} from '../../../../apps/extension/src/features/video/composition/export-enhancement/prepared-source';
import type { GpuPreviewRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/gpu-preview-types';
import { createGpuPreviewRenderer } from '../../../../apps/extension/src/features/video/composition/canvas/gpu-preview';
import {
  createSourceImageFilter,
  sourceImageFilterPlaneSize,
  type SourceImageFilterStack,
} from '../../../../apps/extension/src/features/image-filters/contract';
import { applySourceImageFilters } from '../../../../apps/extension/src/features/image-filters/reference';
const size = { width: 64, height: 48 };
const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
function canvas(data: Uint8ClampedArray) {
  const source = new OffscreenCanvas(size.width, size.height);
  const context = source.getContext('2d');
  if (!context) throw new Error('2D context unavailable.');
  context.putImageData(new ImageData(data, size.width, size.height), 0, 0);
  return source;
}
function pixels(source: ImageBitmap | OffscreenCanvas | HTMLCanvasElement) {
  const output = new OffscreenCanvas(source.width, source.height),
    context = output.getContext('2d');
  if (!context) throw new Error('2D context unavailable.');
  context.drawImage(source, 0, 0);
  return context.getImageData(0, 0, source.width, source.height).data;
}
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let premultiplied = 0,
    straight = 0;
  for (let i = 0; i < a.length; i += 4) {
    premultiplied = Math.max(premultiplied, Math.abs(a[i + 3]! - b[i + 3]!));
    for (let c = 0; c < 3; c++) {
      premultiplied = Math.max(
        premultiplied,
        Math.abs((a[i + c]! * a[i + 3]!) / 255 - (b[i + c]! * b[i + 3]!) / 255)
      );
      if (a[i + 3]! >= 64 && b[i + 3]! >= 64)
        straight = Math.max(straight, Math.abs(a[i + c]! - b[i + c]!));
    }
  }
  return { premultiplied, straight };
}
export async function probe() {
  const renderer = await createGpuPreviewRenderer();
  if (!renderer) throw new Error('Actual WebGPU adapter is required for pixel proof.');
  const data = new Uint8ClampedArray(size.width * size.height * 4);
  for (let y = 0; y < size.height; y++)
    for (let x = 0; x < size.width; x++) {
      const i = (y * size.width + x) * 4;
      data.set([x * 3 + 20, y * 4 + 10, ((x + y) % 24) * 9, x < 16 ? 0 : x < 32 ? 128 : 255], i);
    }
  // The canvas round-trip establishes the actual browser's straight-alpha input bytes.
  const source = canvas(data),
    input = pixels(source);
  const color = createSourceImageFilter('color', 'color');
  if (color.kind !== 'color') throw new Error('Expected color.');
  color.parameters.exposure = 0.4;
  color.parameters.saturation = 0.4;
  color.parameters.temperature = 0.2;
  color.intensity = 0.7;
  const blur = createSourceImageFilter('blur', 'blur');
  blur.intensity = 0.65;
  const bloom = createSourceImageFilter('bloom', 'bloom');
  bloom.intensity = 0.6;
  const stacks: SourceImageFilterStack[] = [
    { version: 1, filters: [] },
    { version: 1, filters: [createSourceImageFilter('color', 'neutral')] },
    { version: 1, filters: [color] },
    { version: 1, filters: [blur] },
    { version: 1, filters: [bloom] },
    { version: 1, filters: [color, blur, bloom] },
    { version: 1, filters: [bloom, blur, color] },
    { version: 1, filters: [{ ...blur, enabled: false }, color] },
  ];
  const catalogueKinds = [
    'monochrome',
    'sepia',
    'sharpen',
    'pixelate',
    'vignette',
    'grain',
  ] as const;
  const catalogue = catalogueKinds.map((kind) => createSourceImageFilter(kind, kind));
  stacks.push(...catalogue.map((filter) => ({ version: 1 as const, filters: [filter] })), {
    version: 1,
    filters: [color, blur, bloom, ...catalogue],
  });
  const frame = new VideoFrame(source, { timestamp: 0 });
  const results = [];
  try {
    for (const [index, stack] of stacks.entries())
      for (const kind of ['raster', 'frame'] as const)
        for (const scale of [1, 2]) {
          const logical = { width: size.width * scale, height: size.height * scale };
          const expected = applySourceImageFilters(input, size.width, size.height, stack, logical);
          const render = () =>
            renderer.render({
              output: size,
              logical: size,
              layers: [
                {
                  source: kind === 'raster' ? source : frame,
                  rect: { x: 0, y: 0, ...size },
                  inverse: identity,
                  imageFilters: { stack, logical },
                },
              ],
              signal: new AbortController().signal,
            });
          const bitmap = await render();
          const actual = pixels(bitmap);
          bitmap.close();
          const repeat = await render();
          const repeated = pixels(repeat);
          repeat.close();
          results.push({
            index,
            kind,
            scale,
            difference: difference(actual, expected),
            repeat: difference(actual, repeated),
          });
        }
    const band = canvas(
      new Uint8ClampedArray(
        Array.from({ length: size.width * size.height }, () => [12, 80, 170, 255]).flat()
      )
    );
    const stack = stacks[5]!;
    const bitmap = await renderer.render({
      output: size,
      logical: size,
      layers: [
        { source: band, rect: { x: 0, y: 0, ...size }, inverse: identity },
        {
          source,
          rect: { x: 0, y: 0, ...size },
          inverse: identity,
          imageFilters: { stack, logical: size },
        },
        { source: band, rect: { x: 0, y: 0, width: 64, height: 8 }, inverse: identity },
        { source: band, rect: { x: 40, y: 24, width: 16, height: 12 }, inverse: identity },
      ],
      signal: new AbortController().signal,
    });
    const actual = pixels(bitmap);
    bitmap.close();
    const witnesses = [0, 7, 24 * 64 + 40, 35 * 64 + 55].map((pixel) => [
      ...actual.slice(pixel * 4, pixel * 4 + 4),
    ]);
    const grainStack: SourceImageFilterStack = {
      version: 1,
      filters: [createSourceImageFilter('grain', 'temporal')],
    };
    const renderGrain = async (projectTime: number) => {
      const bitmap = await renderer.render({
        output: size,
        logical: size,
        layers: [
          {
            source: frame,
            rect: { x: 0, y: 0, ...size },
            inverse: identity,
            imageFilters: { stack: grainStack, logical: size, projectTime },
          },
        ],
        signal: new AbortController().signal,
      });
      try {
        return pixels(bitmap);
      } finally {
        bitmap.close();
      }
    };
    const firstGrain = await renderGrain(0.2),
      otherGrain = await renderGrain(0.8),
      repeatedGrain = await renderGrain(0.2);
    const grainClock = {
      reference: difference(
        firstGrain,
        applySourceImageFilters(input, size.width, size.height, grainStack, size, 0.2)
      ),
      repeat: difference(firstGrain, repeatedGrain),
      changed: difference(firstGrain, otherGrain),
    };
    const prepared = await preparedFilterProof(renderer, [
      stacks[0]!,
      stacks[2]!,
      stacks[3]!,
      stacks[4]!,
      stacks[5]!,
      stacks[10]!,
      stacks[11]!,
      stacks[13]!,
      stacks[14]!,
    ]);
    const orientation = await orientationFilterProof(renderer, source, stacks[5]!);
    return {
      results,
      witnesses,
      prepared,
      orientation,
      grainClock,
      allocated: renderer.allocatedBytes,
    };
  } finally {
    frame.close();
    renderer.dispose();
  }
}

async function preparedFilterProof(renderer: GpuPreviewRenderer, stacks: SourceImageFilterStack[]) {
  const logical = { width: 1920, height: 8 },
    raster = { width: 3840, height: 16 };
  const source = document.createElement('canvas');
  source.width = logical.width;
  source.height = logical.height;
  const original = source.getContext('2d')!;
  original.fillStyle = '#00ff00';
  original.fillRect(0, 0, source.width, source.height);
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const budget = createPreparedSourceBudget();
  const identity = { sourceKey: {}, sourceTime: 2, passTime: 1, sourceSize: logical };
  const prepared = await prepareSourceSampling({
    source,
    identity,
    budget,
    fullSourceSupport: true,
    demands: [
      {
        ...identity,
        id: 'body',
        originalPixelROI: { x: 480, y: 0, width: 960, height: 8 },
        targetRasterSize: { width: 1920, height: 16 },
        sourceToOutputHomography: [2, 0, 0, 0, 2, 0, 0, 0, 1],
      },
    ],
    enhancer: {
      async withEnhancedRegion(_request, consume) {
        const context = tile.getContext('2d')!;
        for (const [index, color] of ['#ff0000', '#0000ff'].entries()) {
          context.fillStyle = color;
          context.fillRect(0, 0, 16, 16);
          await consume({
            image: tile,
            sourceRect: { x: 0, y: 0, width: 16, height: 16 },
            destination: { x: index * 1920, y: 0, width: 1920, height: 16 },
          });
        }
        context.fillStyle = '#00ff00';
        context.fillRect(0, 0, 16, 16);
        return { applied: true, tileCount: 2 };
      },
    },
  });
  const enhanced = document.createElement('canvas');
  enhanced.width = raster.width;
  enhanced.height = raster.height;
  prepared.sampling.drawPrepared(
    'body',
    enhanced.getContext('2d')!,
    { x: 0, y: 0, ...logical },
    { x: 0, y: 0, ...raster }
  );
  const raw = pixels(enhanced),
    results = [];
  try {
    for (const [index, stack] of stacks.entries()) {
      const layers = preparedSourceGpuLayers(
        prepared.sampling,
        'body',
        { x: 0, y: 0, ...raster },
        stack,
        identity.passTime
      );
      if (!layers) throw new Error('Missing prepared source layers.');
      const expected = applySourceImageFilters(
        raw,
        raster.width,
        raster.height,
        stack,
        logical,
        identity.passTime
      );
      const bitmap = await renderer.render({
        output: raster,
        logical: raster,
        layers: layers.layers,
        signal: new AbortController().signal,
      });
      const gpu = pixels(bitmap);
      bitmap.close();
      let cpu: Uint8ClampedArray | undefined, borrowed: HTMLCanvasElement | undefined;
      withSourceImageFilterCanvas(
        {
          stack,
          projectTime: identity.passTime,
          logical,
          raster,
          paint(context) {
            prepared.sampling.drawPrepared(
              'body',
              context,
              { x: 0, y: 0, ...logical },
              { x: 0, y: 0, ...raster }
            );
          },
        },
        (canvas) => {
          borrowed = canvas;
          cpu = pixels(canvas);
        }
      );
      if (!cpu) throw new Error('Missing Canvas filter pixels.');
      results.push({
        index,
        gpu: difference(gpu, expected),
        canvas: difference(cpu, expected),
        temporaryReleased: borrowed?.width === 0,
        sourceLayers: layers.layers.length,
      });
    }
  } finally {
    prepared.dispose();
  }
  return {
    results,
    enhancedWitnesses: [
      [...raw.slice(0, 4)],
      [...raw.slice((raster.width - 1) * 4, raster.width * 4)],
    ],
    sourceWitness: [...original.getImageData(0, 0, 1, 1).data],
    resources: budget.snapshot(),
  };
}

async function orientationFilterProof(
  renderer: GpuPreviewRenderer,
  source: OffscreenCanvas,
  stack: SourceImageFilterStack
) {
  const results = [];
  for (const rotation of [90, 270] as const)
    for (const flip of [false, true]) {
      const display = { width: source.height, height: source.width };
      const normalized = document.createElement('canvas');
      normalized.width = display.width;
      normalized.height = display.height;
      const context = normalized.getContext('2d')!;
      context.translate(display.width / 2, display.height / 2);
      if (flip) context.scale(-1, 1);
      context.rotate((rotation * Math.PI) / 180);
      context.drawImage(source, -source.width / 2, -source.height / 2);
      const original = pixels(normalized),
        expected = applySourceImageFilters(original, display.width, display.height, stack, display);
      const bitmap = await renderer.render({
        output: display,
        logical: display,
        layers: [
          {
            source,
            rect: { x: 0, y: 0, ...display },
            inverse: identity,
            orientation: { rotation, flip },
            imageFilters: { stack, logical: sourceImageFilterPlaneSize(display, rotation) },
          },
        ],
        signal: new AbortController().signal,
      });
      const gpu = pixels(bitmap);
      bitmap.close();
      let cpu: Uint8ClampedArray | undefined;
      withSourceImageFilterCanvas(
        {
          stack,
          logical: display,
          raster: display,
          paint(target) {
            target.drawImage(normalized, 0, 0);
          },
        },
        (canvas) => {
          cpu = pixels(canvas);
        }
      );
      if (!cpu) throw new Error('Missing oriented Canvas source');
      results.push({
        rotation,
        flip,
        gpu: difference(gpu, expected),
        canvas: difference(cpu, expected),
      });
    }
  return results;
}
