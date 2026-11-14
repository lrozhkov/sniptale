import { DotLottie, type TextDocument } from '@lottiefiles/dotlottie-web';
import { animationRuntimeFrameIndex } from '../../contracts/effect-runtime/animation';
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url&inline';
import { parseColor } from '@sniptale/foundation/color';
import { parseEffectControlValues } from '@sniptale/runtime-contracts/effect-controls';
import {
  layoutAnimationText,
  verifyAnimationResource,
  layoutAnimationPointer,
  layoutAnimationArrow,
  resolveAnimationObjectRenderBounds,
  type AnimationTemplate,
} from '@sniptale/runtime-contracts/animation-template';
import { decodeBase64Bytes } from '@sniptale/runtime-contracts/validation/base64';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  assertEffectRasterDimensions,
  EffectRuntimeResourceError,
} from '../../features/video/composition/effect-runtime/runtime/resource-limits';

export class LottieResourceIdentityError extends Error {
  constructor() {
    super('Lottie resource identity is invalid.');
    this.name = 'LottieResourceIdentityError';
  }
}

let initialized: Promise<void> | null = null;
const fonts = new Map<string, Promise<void>>();
let fontBytes = 0;

/** Initialize only the bundled WASM, before the sandbox network guards are installed. */
export function initializeLottieRuntime(): Promise<void> {
  if (!initialized) {
    if (!wasmUrl.startsWith('data:'))
      throw new Error('Lottie WASM must be embedded in the local worker.');
    DotLottie.setWasmUrl(wasmUrl);
    initialized = DotLottie.preload();
  }
  return initialized;
}
function fontName(sha256: string): string {
  return `Sniptale_${sha256}`;
}
async function registerFonts(template: AnimationTemplate, runtime = false): Promise<void> {
  for (const resource of template.resources) {
    if (!resource.mimeType.startsWith('font/')) continue;
    let pending = fonts.get(resource.sha256);
    if (!pending) {
      if (fonts.size >= 32 || fontBytes + resource.byteLength > 16 * 1024 * 1024)
        throw new EffectRuntimeResourceError();
      fontBytes += resource.byteLength;
      pending = (async () => {
        const bytes = decodeBase64Bytes(resource.base64),
          name = fontName(resource.sha256);
        const face = new FontFace(name, bytes);
        await face.load();
        const fontSet: unknown = Reflect.get(self, 'fonts');
        if (
          fontSet === null ||
          typeof fontSet !== 'object' ||
          !('add' in fontSet) ||
          typeof fontSet.add !== 'function'
        )
          throw new Error('Worker font metrics are unavailable.');
        Reflect.apply(fontSet.add, fontSet, [face]);
      })();
      fonts.set(resource.sha256, pending);
    }
    await pending;
    // The core can release its runtime font registration when a player is destroyed.
    // Browser metrics remain cached; every newly loaded core receives the accepted local bytes.
    if (
      runtime &&
      !(await DotLottie.registerFont(fontName(resource.sha256), decodeBase64Bytes(resource.base64)))
    )
      throw new Error('Lottie font registration failed.');
  }
}
function mapFonts(template: AnimationTemplate): Record<string, unknown> {
  const data = structuredClone(template.animation);
  const families = new Map(
    template.resources
      .filter((entry) => entry.mimeType.startsWith('font/'))
      .map((entry) => [entry.fontFamily, fontName(entry.sha256)])
  );
  const aliases = new Map<string, string>();
  const fontList = data['fonts'];
  if (isPlainRecord(fontList) && Array.isArray(fontList['list']))
    for (const entry of fontList['list']) {
      if (
        !isPlainRecord(entry) ||
        typeof entry['fName'] !== 'string' ||
        typeof entry['fFamily'] !== 'string'
      )
        throw new Error('Invalid accepted font metadata.');
      const name = families.get(entry['fFamily']);
      if (!name) throw new Error('Lottie font resource is missing.');
      aliases.set(entry['fName'], name);
      entry['fName'] = name;
      entry['fFamily'] = name;
      delete entry['fPath'];
    }
  const pending: unknown[] = [data];
  while (pending.length) {
    const entry = pending.pop();
    if (Array.isArray(entry)) {
      const children: unknown[] = entry;
      pending.push(...children);
    } else if (isPlainRecord(entry)) {
      if (typeof entry['f'] === 'string' && aliases.has(entry['f']))
        entry['f'] = aliases.get(entry['f']);
      pending.push(...Object.values(entry));
    }
  }
  return data;
}
function textStyle(animation: Record<string, unknown>, slot: string): TextDocument {
  const slots = animation['slots'];
  const entry = isPlainRecord(slots) ? slots[slot] : null;
  const property = isPlainRecord(entry) ? entry['p'] : null;
  const frames = isPlainRecord(property) ? property['k'] : null;
  const first: unknown = Array.isArray(frames) ? frames[0] : null;
  const document = isPlainRecord(first) ? first['s'] : null;
  if (!isPlainRecord(document)) throw new Error('Lottie text slot is missing.');
  const style: TextDocument = {};
  if (typeof document['f'] === 'string') style.f = document['f'];
  if (typeof document['s'] === 'number') style.s = document['s'];
  if (typeof document['lh'] === 'number') style.lh = document['lh'];
  if (typeof document['tr'] === 'number') style.tr = document['tr'];
  if (document['j'] === 0 || document['j'] === 1 || document['j'] === 2) style.j = document['j'];
  const fill = document['fc'];
  if (
    Array.isArray(fill) &&
    typeof fill[0] === 'number' &&
    typeof fill[1] === 'number' &&
    typeof fill[2] === 'number'
  )
    style.fc = [fill[0], fill[1], fill[2]];
  return style;
}
function loaded(player: DotLottie, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  if (player.isLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const load = () => {
      cleanup();
      resolve();
    };
    const error = () => {
      cleanup();
      reject(new Error('Lottie animation load failed.'));
    };
    const abort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const timer = setTimeout(error, 1500);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      player.removeEventListener('load', load);
      player.removeEventListener('loadError', error);
    };
    signal?.addEventListener('abort', abort, { once: true });
    player.addEventListener('load', load);
    player.addEventListener('loadError', error);
  });
}

/** Lottie paint colors are RGB. Alpha belongs to the paint opacity, including authored keyframes. */
function multiplyPaintOpacity(paint: Record<string, unknown>, alpha: number): void {
  const opacity = paint['o'];
  if (opacity === undefined) {
    paint['o'] = { a: 0, k: alpha * 100 };
    return;
  }
  if (!isPlainRecord(opacity)) throw new Error('Lottie paint opacity is invalid.');
  if (opacity['a'] === 0 && typeof opacity['k'] === 'number') {
    opacity['k'] *= alpha;
    return;
  }
  if (opacity['a'] !== 1 || !Array.isArray(opacity['k']))
    throw new Error('Lottie paint opacity is unsupported.');
  for (const frame of opacity['k']) {
    if (!isPlainRecord(frame)) throw new Error('Lottie paint keyframe is invalid.');
    for (const key of ['s', 'e']) {
      const value = frame[key];
      if (value === undefined) continue;
      if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'number')
        throw new Error('Lottie paint keyframe is unsupported.');
      value[0] *= alpha;
    }
  }
}

function animationViewport(
  animation: Record<string, unknown>,
  bounds: { x: number; y: number; width: number; height: number }
): Record<string, unknown> {
  const data = structuredClone(animation);
  data['w'] = Math.ceil(bounds.width);
  data['h'] = Math.ceil(bounds.height);
  if (bounds.x === 0 && bounds.y === 0) return data;
  const layers = data['layers'];
  if (!Array.isArray(layers)) throw new Error('Animation layers are invalid.');
  const indices = new Set(
    layers.flatMap((layer: unknown) =>
      isPlainRecord(layer) && typeof layer['ind'] === 'number' ? [layer['ind']] : []
    )
  );
  let parent = 1;
  while (indices.has(parent)) parent++;
  for (const layer of layers)
    if (isPlainRecord(layer) && layer['parent'] === undefined) layer['parent'] = parent;
  const property = (k: number | number[]) => ({ a: 0, k });
  layers.push({
    ty: 3,
    ind: parent,
    ddd: 0,
    sr: 1,
    ip: data['ip'],
    op: data['op'],
    st: 0,
    ks: {
      o: property(100),
      r: property(0),
      p: property([-bounds.x, -bounds.y, 0]),
      a: property([0, 0, 0]),
      s: property([100, 100, 100]),
    },
  });
  return data;
}

/** One player belongs to one accepted immutable model. The execution owner serializes its requests. */
export async function createLottieFrameRenderer(template: AnimationTemplate) {
  for (const resource of template.resources)
    if (!(await verifyAnimationResource(resource))) throw new LottieResourceIdentityError();
  await initializeLottieRuntime();
  await registerFonts(template);
  const animation = mapFonts(template);
  const width = animation['w'],
    height = animation['h'],
    fr = animation['fr'],
    ip = animation['ip'],
    op = animation['op'];
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof fr !== 'number' ||
    typeof ip !== 'number' ||
    typeof op !== 'number'
  )
    throw new Error('Invalid accepted Lottie dimensions or timing.');
  const canvas = new OffscreenCanvas(width, height);
  const resources = new Map(
    template.resources
      .filter((entry) => entry.mimeType.startsWith('image/'))
      .map((entry) => [entry.path, decodeBase64Bytes(entry.base64)])
  );
  const lifetime = new AbortController();
  let player: DotLottie | null = null;
  let disposed = false;
  let revision: string | null = null;
  let viewportRevision: string | null = null;
  return {
    async render(request: {
      time: number;
      width: number;
      height: number;
      values: unknown;
      signal: AbortSignal;
    }): Promise<ImageBitmap> {
      if (disposed) throw new Error('Lottie model is disposed.');
      const signal = AbortSignal.any([request.signal, lifetime.signal]);
      signal.throwIfAborted();
      assertEffectRasterDimensions(request.width, request.height);
      if (!Number.isFinite(request.time)) throw new Error('Lottie frame time is invalid.');
      const values = parseEffectControlValues(template, request.values);
      if (!values) throw new Error('Lottie control values are invalid.');
      const bounds = resolveAnimationObjectRenderBounds(template, values);
      const nextRevision = JSON.stringify([bounds, values]);
      if (revision !== nextRevision) {
        const slotValues = new Map<string, Record<string, unknown>>();
        const colorAlpha = new Map<string, number>();
        const slots = animation['slots'];
        if (isPlainRecord(slots))
          for (const [name, slot] of Object.entries(slots)) {
            if (isPlainRecord(slot) && isPlainRecord(slot['p']))
              slotValues.set(name, structuredClone(slot['p']));
          }
        const setVector = (slot: string, value: number[]) => {
          slotValues.set(slot, { a: 0, k: value });
        };
        const setText = (slot: string, value: TextDocument) => {
          slotValues.set(slot, { a: 0, k: [{ t: 0, s: value }] });
        };
        const setScalar = (slot: string, value: number) => {
          slotValues.set(slot, { a: 0, k: value });
        };
        for (const binding of template.bindings) {
          if (binding.kind === 'vector') {
            const x = values[binding.xControl],
              y = values[binding.yControl];
            if (typeof x !== 'number' || typeof y !== 'number')
              throw new Error('Lottie vector controls are invalid.');
            setVector(
              binding.slot,
              binding.unit === 'normalized-to-pixels' ? [x * width, y * height] : [x, y]
            );
            continue;
          }
          const value = values[binding.control];
          if (binding.kind === 'text' && typeof value === 'string') {
            setText(binding.slot, {
              ...textStyle(animation, binding.slot),
              t: value.replace(/\r\n?|\n/gu, '\r'),
            });
          } else if (binding.kind === 'color' && typeof value === 'string') {
            const color = parseColor(value);
            if (!color) throw new Error('Lottie color control is invalid.');
            colorAlpha.set(binding.slot, color.alpha);
            setVector(binding.slot, [
              color.red / 255,
              color.green / 255,
              color.blue / 255,
              color.alpha,
            ]);
          } else if (binding.kind === 'scalar' && typeof value === 'number') {
            setScalar(
              binding.slot,
              binding.unit === 'percent-to-ratio'
                ? value / 100
                : binding.unit === 'degrees-to-radians'
                  ? (value * Math.PI) / 180
                  : value
            );
          } else throw new Error('Lottie slot control is invalid.');
        }
        const arrow = template.objectLayout?.arrow;
        if (arrow) {
          const sx = values[arrow.start.xControl],
            sy = values[arrow.start.yControl],
            ex = values[arrow.end.xControl],
            ey = values[arrow.end.yControl],
            stroke = values[arrow.widthControl];
          if (
            typeof sx !== 'number' ||
            typeof sy !== 'number' ||
            typeof ex !== 'number' ||
            typeof ey !== 'number' ||
            typeof stroke !== 'number'
          )
            throw new Error('Lottie arrow controls are invalid.');
          const geometry = layoutAnimationArrow({ x: sx, y: sy }, { x: ex, y: ey }, stroke);
          setVector(arrow.positionSlot, [geometry.position.x, geometry.position.y]);
          setScalar(arrow.rotationSlot, geometry.rotation);
          setVector(arrow.shaftScaleSlot, [geometry.shaftScale.x, geometry.shaftScale.y]);
          setVector(arrow.headPositionSlot, [geometry.headPosition.x, geometry.headPosition.y]);
          setVector(arrow.headScaleSlot, [geometry.headScale.x, geometry.headScale.y]);
        }
        const reflow = template.objectLayout?.reflow;
        if (reflow) {
          const text = values[reflow.textControl],
            fontSize = values[reflow.fontSizeControl],
            boxWidth = values[reflow.widthControl];
          const resource = template.resources.find((entry) => entry.path === reflow.fontResource);
          if (
            typeof text !== 'string' ||
            typeof fontSize !== 'number' ||
            typeof boxWidth !== 'number' ||
            !resource
          )
            throw new Error('Lottie reflow controls are invalid.');
          const context = new OffscreenCanvas(1, 1).getContext('2d');
          if (!context) throw new Error('Lottie font metrics are unavailable.');
          const style = textStyle(animation, reflow.textSlot);
          const layout = layoutAnimationText({
            text,
            width: boxWidth,
            fontSize,
            minFontSize: reflow.minFontSize,
            padding: reflow.padding,
            lineHeight: reflow.lineHeight,
            maxLines: reflow.maxLines,
            measure(text, size) {
              context.font = `${size}px "${fontName(resource.sha256)}"`;
              return (
                context.measureText(text).width +
                (Math.max(0, Array.from(text).length - 1) * size * (style.tr ?? 0)) / 1000
              );
            },
          });
          if (layout.width > width || layout.height > height)
            throw new Error('Animation text exceeds its authored viewport.');
          setText(reflow.textSlot, {
            ...style,
            f: fontName(resource.sha256),
            t: layout.text.replaceAll('\n', '\r'),
            s: layout.fontSize,
            lh: layout.fontSize * reflow.lineHeight,
          });
          setVector(reflow.boxSizeSlot, [layout.width, layout.height]);
          setVector(reflow.boxPositionSlot, [layout.width / 2, layout.height / 2]);
          setVector(reflow.textPositionSlot, [
            style.j === 1
              ? layout.width - reflow.padding
              : style.j === 2
                ? layout.width / 2
                : reflow.padding,
            reflow.padding + layout.fontSize,
          ]);
          if (reflow.pointer && reflow.tip) {
            const x = values[reflow.tip.xControl],
              y = values[reflow.tip.yControl];
            if (typeof x !== 'number' || typeof y !== 'number')
              throw new Error('Lottie pointer controls are invalid.');
            const pointer = layoutAnimationPointer(layout, { x, y }, reflow.pointer.width);
            setVector(reflow.pointer.positionSlot, [pointer.position.x, pointer.position.y]);
            setVector(reflow.pointer.scaleSlot, [pointer.scale.x, pointer.scale.y]);
            setScalar(reflow.pointer.rotationSlot, pointer.rotation);
          }
        }
        const source = animationViewport(animation, bounds);
        // Resolve only declared Lottie slots. ThorVG accepts some layer slots without applying them.
        // Static overrides are materialized once per parameter revision, never once per video frame.
        const pending: unknown[] = [source];
        const paints: Array<{ paint: Record<string, unknown>; alpha: number }> = [];
        while (pending.length) {
          const node = pending.pop();
          if (Array.isArray(node)) {
            const children: unknown[] = node;
            pending.push(...children);
          } else if (isPlainRecord(node)) {
            const color = node['c'];
            if (
              (node['ty'] === 'fl' || node['ty'] === 'st') &&
              isPlainRecord(color) &&
              typeof color['sid'] === 'string'
            ) {
              const alpha = colorAlpha.get(color['sid']);
              if (alpha !== undefined && alpha !== 1) paints.push({ paint: node, alpha });
            }
            const override =
              typeof node['sid'] === 'string' ? slotValues.get(node['sid']) : undefined;
            if (override) {
              Object.assign(node, structuredClone(override));
              delete node['sid'];
            }
            pending.push(...Object.values(node));
          }
        }
        for (const { paint, alpha } of paints) multiplyPaintOpacity(paint, alpha);
        player?.destroy();
        player = null;
        revision = null;
        await registerFonts(template, true);
        signal.throwIfAborted();
        const candidate = new DotLottie({
          canvas,
          data: source,
          autoplay: false,
          loop: false,
          useFrameInterpolation: false,
          layout: { fit: 'none', align: [0, 0] },
          renderConfig: { devicePixelRatio: 1, freezeOnOffscreen: false },
          // The core prefixes package-local image paths with its virtual root.
          assetResolver: (path) =>
            resources.get(path.startsWith('/') ? path.slice(1) : path) ?? null,
        });
        try {
          await loaded(candidate, signal);
          signal.throwIfAborted();
          if (disposed) throw new Error('Lottie model is disposed.');
        } catch (error) {
          candidate.destroy();
          throw error;
        }
        player = candidate;
        revision = nextRevision;
        viewportRevision = null;
      }
      if (!player) throw new Error('Lottie animation is unavailable.');
      if (canvas.width !== request.width || canvas.height !== request.height) {
        canvas.width = request.width;
        canvas.height = request.height;
        player.resize();
        viewportRevision = null;
      }
      const nextViewport = JSON.stringify([
        request.width,
        request.height,
        bounds.width,
        bounds.height,
      ]);
      // setTransform renders immediately in dotLottie; unchanged geometry must not repaint the old frame.
      if (viewportRevision !== nextViewport) {
        if (
          !player.setViewport(0, 0, request.width, request.height) ||
          !player.setTransform([
            request.width / bounds.width,
            0,
            0,
            0,
            request.height / bounds.height,
            0,
            0,
            0,
            1,
          ])
        )
          throw new Error('Lottie viewport geometry is unavailable.');
        viewportRevision = nextViewport;
      }
      // dotLottie uses a frame index relative to ip; the core applies the source in-point.
      player.setFrame(animationRuntimeFrameIndex({ fr, ip, op }, request.time));
      signal.throwIfAborted();
      // The incremental player can skip unchanged frames. Transfer would clear its retained image.
      const bitmap = await createImageBitmap(canvas);
      if (signal.aborted || disposed) {
        bitmap.close();
        signal.throwIfAborted();
        throw new Error('Lottie model is disposed.');
      }
      return bitmap;
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        lifetime.abort(new Error('Lottie model is disposed.'));
        player?.destroy();
        player = null;
        canvas.width = 1;
        canvas.height = 1;
        resources.clear();
      }
    },
  };
}
