import type {
  EffectRuntimeGpuBlend,
  EffectRuntimeGpuDraw,
  EffectRuntimeGpuFilter,
  EffectRuntimeGpuOperation,
  EffectRuntimeGpuPass,
  EffectRuntimeGpuRect,
  EffectRuntimeGpuResource,
  EffectRuntimeGpuTransform,
} from '../../../contracts/effect-runtime/gpu-plan';
import type {
  EffectRuntimeGpuPlanResult,
  EffectRuntimeWorkerRequest,
} from '../../../contracts/effect-runtime/types';
import { getEffectRuntimeIdentity } from '../../../contracts/effect-runtime/identity';
import { getLogicalCanvasSize } from '../canvas/logical-canvas';
import { primitiveRasterRegion } from '../canvas/primitive-bounds';
import {
  assertEffectDecodedRaster,
  EFFECT_RUNTIME_RESOURCE_LIMITS,
  EffectRuntimeResourceError,
} from '../resource-policy';
import {
  resolveCoverCrop,
  type DrawImageAssetArgs,
  type RuntimeBitmapAsset,
} from '../assets/render-assets';
import type { RuntimeCanvas, RuntimeCanvasContext } from '../model/types';
import type { EffectRuntimeDrawingTarget, RenderState } from './model';

type State = Pick<RenderState, 'canvas' | 'context'>;
type Clip = { rect: EffectRuntimeGpuRect; transform: EffectRuntimeGpuTransform };
type Pass = {
  canvas: RuntimeCanvas;
  operations: EffectRuntimeGpuOperation[];
  clips: Clip[];
  revision: number;
  snapshot?: { revision: number; id: number };
};
type Resource = { wire: EffectRuntimeGpuResource; owned: boolean };
const identity: EffectRuntimeGpuTransform = [1, 0, 0, 1, 0, 0];
const noFilter: EffectRuntimeGpuFilter = { blur: 0, brightness: 1, saturate: 1 };
const paintProperties = [
  'fillStyle',
  'strokeStyle',
  'font',
  'globalAlpha',
  'globalCompositeOperation',
  'filter',
  'lineCap',
  'lineJoin',
  'lineWidth',
  'shadowBlur',
  'shadowColor',
  'shadowOffsetX',
  'shadowOffsetY',
  'textAlign',
  'textBaseline',
] as const;

/** Emit evaluated operands below the admitted interpreter. Image and pass pixels never enter Canvas. */
export function createEffectRuntimeGpuTarget(
  request: EffectRuntimeWorkerRequest,
  allocateRaster: (width: number, height: number) => () => void,
  liveCanvasBytes: () => number,
  createCanvas: (width: number, height: number) => RuntimeCanvas = (width, height) =>
    new OffscreenCanvas(width, height)
) {
  const records = new Map<RuntimeCanvas, Pass>();
  const resources = new Map<number, Resource>();
  const inputs = new Map<ImageBitmap, number>();
  const assets = new Map<ImageBitmap, number>();
  const masks = new Map<string, number>();
  const passes: EffectRuntimeGpuPass[] = [];
  const inputResources: EffectRuntimeGpuPlanResult['inputResources'] = {};
  let nextResource = 0;
  let resourceBytes = 0;
  let adopted = false;
  let scratch: {
    canvas: RuntimeCanvas;
    context: RuntimeCanvasContext;
    padding: number;
    release(): void;
  } | null = null;

  const record = (canvas: RuntimeCanvas): Pass => {
    let value = records.get(canvas);
    if (!value) {
      value = { canvas, operations: [], clips: [], revision: 0 };
      records.set(canvas, value);
    }
    return value;
  };
  const admitBitmap = (width: number, height: number) => {
    const bytes = assertEffectDecodedRaster(width, height);
    if (
      resourceBytes + liveCanvasBytes() + bytes >
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
    )
      throw new EffectRuntimeResourceError();
  };
  const add = (
    bitmap: ImageBitmap,
    kind: EffectRuntimeGpuResource['kind'],
    owned: boolean,
    id = nextResource++
  ) => {
    const bytes = assertEffectDecodedRaster(bitmap.width, bitmap.height);
    if (
      resourceBytes + liveCanvasBytes() + bytes >
      EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
    )
      throw new EffectRuntimeResourceError();
    resourceBytes += bytes;
    resources.set(id, {
      wire: { id, kind, bitmap, width: bitmap.width, height: bitmap.height },
      owned,
    });
    return id;
  };
  const snapshotBitmap = (canvas: RuntimeCanvas, kind: 'primitive' | 'coverage') => {
    admitBitmap(canvas.width, canvas.height);
    let bitmap: ImageBitmap | undefined;
    try {
      if (!canvas.transferToImageBitmap) throw new Error('GPU_PRIMITIVE_TRANSFER_UNAVAILABLE');
      bitmap = canvas.transferToImageBitmap();
      return add(bitmap, kind, true);
    } catch (error) {
      bitmap?.close();
      throw error;
    }
  };
  const matrix = (context: RuntimeCanvasContext): EffectRuntimeGpuTransform => {
    const value = (
      context as RuntimeCanvasContext & Pick<OffscreenCanvasRenderingContext2D, 'getTransform'>
    ).getTransform();
    const padding = scratch?.context === context ? scratch.padding : 0;
    return [value.a, value.b, value.c, value.d, value.e - padding, value.f - padding];
  };
  const coverage = (pass: Pass): number | undefined => {
    if (!pass.clips.length) return undefined;
    const key = JSON.stringify([pass.canvas.width, pass.canvas.height, pass.clips]);
    const known = masks.get(key);
    if (known !== undefined) return known;
    const release = allocateRaster(pass.canvas.width, pass.canvas.height);
    const canvas = createCanvas(pass.canvas.width, pass.canvas.height);
    try {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('GPU_CLIP_CONTEXT_UNAVAILABLE');
      for (const clip of pass.clips) {
        context.setTransform(...clip.transform);
        context.beginPath();
        context.rect(clip.rect.x, clip.rect.y, clip.rect.width, clip.rect.height);
        context.clip();
      }
      context.setTransform(...identity);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const id = snapshotBitmap(canvas, 'coverage');
      masks.set(key, id);
      return id;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      release();
    }
  };
  const rgba = (value: string): readonly [number, number, number, number] => {
    if (value === 'transparent' || value === 'rgba(0, 0, 0, 0)' || value === '#00000000')
      return [0, 0, 0, 0];
    const release = allocateRaster(1, 1);
    const canvas = createCanvas(1, 1);
    try {
      const context = canvas.getContext('2d') as RuntimeCanvasContext &
        Pick<OffscreenCanvasRenderingContext2D, 'getImageData'>;
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      return [pixel[0]! / 255, pixel[1]! / 255, pixel[2]! / 255, pixel[3]! / 255];
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      release();
    }
  };
  const style = (context: RuntimeCanvasContext) => ({
    alpha: context.globalAlpha,
    blend: readBlend(context.globalCompositeOperation),
    filter: readFilter(context.filter),
    shadow: {
      color: rgba(context.shadowColor),
      blur: context.shadowBlur,
      offsetX: context.shadowOffsetX,
      offsetY: context.shadowOffsetY,
    },
  });
  const bitmapId = (bitmap: ImageBitmap) => {
    const input = inputs.get(bitmap);
    if (input !== undefined) return input;
    let id = assets.get(bitmap);
    if (id === undefined) {
      id = nextResource++;
      assets.set(bitmap, id);
    }
    return id;
  };
  const snapshot = (canvas: RuntimeCanvas) => {
    const pass = record(canvas);
    if (pass.snapshot?.revision === pass.revision) return pass.snapshot.id;
    const logical = getLogicalCanvasSize(canvas);
    const id = passes.length;
    passes.push({
      id,
      width: canvas.width,
      height: canvas.height,
      logicalWidth: logical.width,
      logicalHeight: logical.height,
      operations: [...pass.operations],
    });
    pass.snapshot = { revision: pass.revision, id };
    return id;
  };
  const append = (state: State, draw: Omit<EffectRuntimeGpuDraw, 'op' | 'coverage'>) => {
    const pass = record(state.canvas);
    const clip = coverage(pass);
    pass.operations.push({
      op: 'draw',
      ...draw,
      ...(clip === undefined ? {} : { coverage: clip }),
    });
    pass.revision += 1;
  };
  const ensureScratch = (state: State) => {
    const current = style(state.context);
    // Six sigmas bounds the Gaussian tail well below one 8-bit channel value.
    const visibleShadow = current.shadow.color[3] > 0;
    const padding = Math.ceil(
      6 * (current.filter.blur + (visibleShadow ? current.shadow.blur : 0)) +
        (visibleShadow
          ? Math.max(Math.abs(current.shadow.offsetX), Math.abs(current.shadow.offsetY))
          : 0) +
        2
    );
    const width = state.canvas.width + padding * 2,
      height = state.canvas.height + padding * 2;
    if (!scratch || scratch.canvas.width !== width || scratch.canvas.height !== height) {
      scratch?.release();
      if (scratch) {
        scratch.canvas.width = 0;
        scratch.canvas.height = 0;
      }
      const release = allocateRaster(width, height);
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) {
        release();
        throw new Error('GPU_PRIMITIVE_CONTEXT_UNAVAILABLE');
      }
      scratch = { canvas, context, padding, release };
    }
    return scratch;
  };

  for (const name of ['source', 'from', 'to'] as const) {
    const frame = request.inputFrames[name];
    if (frame) {
      const id = add(frame.bitmap, 'input', false);
      inputs.set(frame.bitmap, id);
      inputResources[name] = id;
    }
  }
  const target: EffectRuntimeDrawingTarget = {
    primitive(state, draw) {
      const original = state.context;
      const temporary = ensureScratch(state);
      const transform = matrix(original);
      const context = temporary.context;
      context.setTransform(...identity);
      context.clearRect(0, 0, temporary.canvas.width, temporary.canvas.height);
      context.setTransform(
        transform[0],
        transform[1],
        transform[2],
        transform[3],
        transform[4] + temporary.padding,
        transform[5] + temporary.padding
      );
      for (const property of paintProperties) copyPaintProperty(context, original, property);
      state.context = context;
      try {
        draw();
      } finally {
        state.context = original;
      }
    },
    paint(state, draw, bounds, stroke = 0) {
      if (!scratch || scratch.context !== state.context)
        throw new Error('GPU_PRIMITIVE_STATE_INVALID');
      const context = state.context;
      if (bounds === null) return;
      const current = style(context);
      context.save();
      try {
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'source-over';
        context.filter = 'none';
        context.shadowColor = 'transparent';
        draw();
      } finally {
        context.restore();
      }
      const transform = (
        context as RuntimeCanvasContext & Pick<OffscreenCanvasRenderingContext2D, 'getTransform'>
      ).getTransform();
      const region = primitiveRasterRegion(
        bounds,
        [transform.a, transform.b, transform.c, transform.d, transform.e, transform.f],
        scratch.canvas,
        scratch.padding,
        stroke
      );
      const release = allocateRaster(region.width, region.height);
      let canvas: RuntimeCanvas | undefined;
      let resource: number;
      try {
        canvas = createCanvas(region.width, region.height);
        const copy = canvas.getContext('2d');
        if (!copy) throw new Error('GPU_PRIMITIVE_COPY_CONTEXT_UNAVAILABLE');
        copy.drawImage(
          scratch.canvas,
          region.x,
          region.y,
          region.width,
          region.height,
          0,
          0,
          region.width,
          region.height
        );
        resource = snapshotBitmap(canvas, 'primitive');
      } finally {
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
        release();
        context.save();
        context.setTransform(...identity);
        context.clearRect(0, 0, scratch.canvas.width, scratch.canvas.height);
        context.restore();
      }
      append(state, {
        source: { kind: 'resource', id: resource },
        sourceRect: { x: 0, y: 0, width: region.width, height: region.height },
        destination: {
          x: region.x - scratch.padding,
          y: region.y - scratch.padding,
          width: region.width,
          height: region.height,
        },
        transform: identity,
        ...current,
      });
    },
    image(state, asset: RuntimeBitmapAsset, args: DrawImageAssetArgs) {
      const width = (args.width ?? asset.width ?? asset.bitmap.width) * (args.scale ?? 1);
      const height = (args.height ?? asset.height ?? asset.bitmap.height) * (args.scale ?? 1);
      const context = state.context;
      context.save();
      try {
        context.translate((args.x ?? 0) + width / 2, (args.y ?? 0) + height / 2);
        context.rotate(args.rotate ?? 0);
        append(state, {
          source: { kind: 'resource', id: bitmapId(asset.bitmap) },
          sourceRect: resolveCoverCrop(asset.bitmap, width, height, args.fit ?? 'contain'),
          destination: { x: -width / 2, y: -height / 2, width, height },
          transform: matrix(context),
          ...style(context),
        });
      } finally {
        context.restore();
      }
    },
    composite(state, pass, destination) {
      append(state, {
        source: { kind: 'pass', id: snapshot(pass) },
        sourceRect: { x: 0, y: 0, width: pass.width, height: pass.height },
        destination,
        transform: matrix(state.context),
        ...style(state.context),
      });
    },
    clip(state, rect, draw) {
      const clips = record(state.canvas).clips;
      clips.push({ rect: { ...rect }, transform: matrix(state.context) });
      try {
        draw();
      } finally {
        clips.pop();
      }
    },
    observeClip(canvas, context, rect) {
      record(canvas).clips.push({ rect: { ...rect }, transform: matrix(context) });
    },
    clear(state) {
      const pass = record(state.canvas);
      const clip = coverage(pass);
      if (clip === undefined) pass.operations.length = 0;
      else pass.operations.push({ op: 'clear', coverage: clip });
      pass.revision += 1;
    },
    isRawContext(context) {
      return scratch?.context === context;
    },
  };
  return {
    target,
    admitCanvas(bytes: number) {
      if (
        !Number.isSafeInteger(bytes) ||
        bytes <= 0 ||
        resourceBytes + liveCanvasBytes() + bytes >
          EFFECT_RUNTIME_RESOURCE_LIMITS.maxDecodedRasterBytes
      )
        throw new EffectRuntimeResourceError();
    },
    get adoptedInputs() {
      return adopted;
    },
    async finish(canvas: RuntimeCanvas): Promise<EffectRuntimeGpuPlanResult> {
      const rootPass = snapshot(canvas);
      for (const [bitmap, id] of assets) {
        admitBitmap(bitmap.width, bitmap.height);
        let clone: ImageBitmap | undefined;
        try {
          clone = await createImageBitmap(bitmap);
          add(clone, 'asset-clone', true, id);
        } catch (error) {
          clone?.close();
          throw error;
        }
      }
      const result: EffectRuntimeGpuPlanResult = {
        ...getEffectRuntimeIdentity(request),
        kind: 'gpu-plan',
        acknowledged: {
          assetSelectionId: request.assetSelectionId,
          documentId: request.documentId,
        },
        width: request.renderWidth,
        height: request.renderHeight,
        logicalWidth: request.width,
        logicalHeight: request.height,
        resources: [...resources.values()].map(({ wire }) => wire),
        passes,
        rootPass,
        inputResources,
      };
      adopted = true;
      return result;
    },
    dispose() {
      for (const resource of resources.values()) {
        if (!adopted && resource.owned) resource.wire.bitmap.close();
      }
      resources.clear();
      resourceBytes = 0;
      scratch?.release();
      if (scratch) {
        scratch.canvas.width = 0;
        scratch.canvas.height = 0;
      }
      scratch = null;
    },
  };
}

function copyPaintProperty<K extends (typeof paintProperties)[number]>(
  target: RuntimeCanvasContext,
  source: RuntimeCanvasContext,
  key: K
) {
  target[key] = source[key];
}

function readBlend(value: GlobalCompositeOperation): EffectRuntimeGpuBlend {
  if (
    value === 'source-over' ||
    value === 'lighter' ||
    value === 'screen' ||
    value === 'source-atop' ||
    value === 'destination-in'
  )
    return value;
  throw new Error('GPU_DRAW_BLEND_INVALID');
}

function readFilter(value: string): EffectRuntimeGpuFilter {
  if (value === 'none') return noFilter;
  const result = { ...noFilter };
  let rest = value.trim();
  for (const [key, pattern] of [
    ['blur', /^blur\(([0-9.eE+\-]+)px\)\s*/],
    ['brightness', /^brightness\(([0-9.eE+\-]+)\)\s*/],
    ['saturate', /^saturate\(([0-9.eE+\-]+)\)\s*/],
  ] as const) {
    const match = pattern.exec(rest);
    if (!match) continue;
    const number = Number(match[1]);
    if (!Number.isFinite(number) || number < 0) throw new Error('GPU_DRAW_FILTER_INVALID');
    result[key] = number;
    rest = rest.slice(match[0].length);
  }
  if (rest) throw new Error('GPU_DRAW_FILTER_INVALID');
  return result;
}
