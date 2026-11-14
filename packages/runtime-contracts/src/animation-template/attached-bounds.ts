import { decodeBase64Bytes } from '../validation/base64.js';
import { isPlainRecord as record } from '../validation/primitives.js';
import type { AnimationResource, AnimationTemplate } from './types.js';

type Box = { x: number; y: number; right: number; bottom: number };
type Controls = Readonly<Record<string, unknown>>;
type Json = Record<string, unknown>;
const union = (a: Box, b: Box): Box => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  right: Math.max(a.right, b.right),
  bottom: Math.max(a.bottom, b.bottom),
});
const vector = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every((v) => typeof v === 'number' && Number.isFinite(v));

// Font headers give a conservative ink/advance bound without decoding entire fonts on each frame.
type Metrics = {
  em: number;
  advance: number;
  left: number;
  bottom: number;
  right: number;
  top: number;
};
const fonts = new WeakMap<
  AnimationResource,
  { base64: string; byteLength: number; metrics: Metrics | null }
>();
function fontMetrics(resource: AnimationResource): Metrics | null {
  const cached = fonts.get(resource);
  if (cached?.base64 === resource.base64 && cached.byteLength === resource.byteLength)
    return cached.metrics;
  let result: Metrics | null = null;
  try {
    const bytes = (offset: number, length: number) => {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > resource.byteLength)
        throw new Error('Invalid font table.');
      const start = Math.floor(offset / 3) * 3;
      const decoded = decodeBase64Bytes(
        resource.base64.slice((start / 3) * 4, Math.ceil((offset + length) / 3) * 4)
      );
      return new DataView(decoded.buffer, decoded.byteOffset + offset - start, length);
    };
    const count = bytes(0, 12).getUint16(4);
    if (count > 512) throw new Error('Invalid font table count.');
    const directory = bytes(12, count * 16);
    let head = 0,
      hhea = 0;
    for (let n = 0; n < count; n++) {
      const tag = directory.getUint32(n * 16),
        offset = directory.getUint32(n * 16 + 8);
      if (tag === 0x68656164) head = offset;
      if (tag === 0x68686561) hhea = offset;
    }
    if (head && hhea) {
      const h = bytes(head, 54),
        a = bytes(hhea, 36);
      const em = h.getUint16(18),
        advance = a.getUint16(10);
      if (em > 0 && advance > 0)
        result = {
          em,
          advance,
          left: h.getInt16(36),
          bottom: h.getInt16(38),
          right: h.getInt16(40),
          top: h.getInt16(42),
        };
    }
  } catch {
    /* Unsupported font containers retain the declared handle padding. */
  }
  fonts.set(resource, {
    base64: resource.base64,
    byteLength: resource.byteLength,
    metrics: result,
  });
  return result;
}

function propertyValues(property: unknown): number[][] | null {
  if (!record(property)) return null;
  if (property['a'] !== 1) {
    if (typeof property['k'] === 'number' && Number.isFinite(property['k']))
      return [[property['k']]];
    return vector(property['k']) ? [property['k']] : null;
  }
  if (!Array.isArray(property['k'])) return null;
  const values: number[][] = [];
  for (const key of property['k']) {
    if (!record(key) || !vector(key['s']) || key['to'] || key['ti']) return null;
    // The endpoint envelope is valid for monotone temporal easing and held keys.
    for (const tangent of [key['i'], key['o']]) {
      if (!record(tangent)) continue;
      const ys = typeof tangent['y'] === 'number' ? [tangent['y']] : tangent['y'];
      if (!vector(ys) || ys.some((y) => y < 0 || y > 1)) return null;
    }
    values.push(key['s']);
    if (key['e'] !== undefined) {
      if (!vector(key['e'])) return null;
      values.push(key['e']);
    }
  }
  return values.length ? values : null;
}
function transform(
  box: Box,
  ks: unknown,
  template: AnimationTemplate,
  controls: Controls
): Box | null {
  if (!record(ks)) return null;
  const p = record(ks['p']) ? ks['p'] : null;
  const binding = template.bindings.find((b) => b.kind === 'vector' && b.slot === p?.['sid']);
  let positions = propertyValues(p);
  if (binding?.kind === 'vector') {
    const x = controls[binding.xControl],
      y = controls[binding.yControl];
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    positions = [
      [
        x * (binding.unit === 'normalized-to-pixels' ? template.animation.w : 1),
        y * (binding.unit === 'normalized-to-pixels' ? template.animation.h : 1),
      ],
    ];
  }
  const anchors = propertyValues(ks['a']),
    scales = propertyValues(ks['s']),
    angles = propertyValues(ks['r']);
  if (
    !positions ||
    !anchors ||
    !scales ||
    !angles ||
    angles.length !== 1 ||
    ks['rx'] ||
    ks['ry'] ||
    ks['sk']
  )
    return null;
  const angle = (angles[0]![0]! * Math.PI) / 180,
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const range = (values: number[][], axis: number) => {
    const ns = values.map((v) => v[axis]);
    if (ns.some((n) => n === undefined)) return null;
    const numbers = ns.filter((n): n is number => n !== undefined);
    return [Math.min(...numbers), Math.max(...numbers)];
  };
  const px = range(positions, 0),
    py = range(positions, 1),
    ax = range(anchors, 0),
    ay = range(anchors, 1),
    sx = range(scales, 0),
    sy = range(scales, 1);
  if (!px || !py || !ax || !ay || !sx || !sy) return null;
  const xs = [box.x, box.right].flatMap((x) =>
      ax.flatMap((a) => sx.map((s) => ((x - a) * s) / 100))
    ),
    ys = [box.y, box.bottom].flatMap((y) => ay.flatMap((a) => sy.map((s) => ((y - a) * s) / 100)));
  const points = xs.flatMap((x) => ys.map((y) => ({ x: x * cos - y * sin, y: x * sin + y * cos })));
  return {
    x: Math.min(...points.map((p) => p['x'])) + px[0]!,
    y: Math.min(...points.map((p) => p['y'])) + py[0]!,
    right: Math.max(...points.map((p) => p['x'])) + px[1]!,
    bottom: Math.max(...points.map((p) => p['y'])) + py[1]!,
  };
}
function textBounds(layer: Json, template: AnimationTemplate, controls: Controls): Box | null {
  const t = record(layer['t']) ? layer['t'] : null,
    d = t && record(t['d']) ? t['d'] : null;
  if (
    !d ||
    !Array.isArray(d['k']) ||
    d['k'].length !== 1 ||
    !record(d['k'][0]) ||
    !record(d['k'][0]['s'])
  )
    return null;
  const style = d['k'][0]['s'],
    binding = template.bindings.find((b) => b.kind === 'text' && b.slot === d['sid']);
  const text = binding?.kind === 'text' ? controls[binding.control] : style['t'];
  if (
    typeof text !== 'string' ||
    typeof style['s'] !== 'number' ||
    style['sz'] ||
    style['ps'] ||
    (Array.isArray(t?.['a']) &&
      t['a'].some(
        (animator) =>
          !record(animator) ||
          !record(animator['a']) ||
          Object.keys(animator['a']).some((key) => !['o', 'fc', 'sc'].includes(key))
      ))
  )
    return null;
  const fontList: unknown[] =
    record(template.animation['fonts']) && Array.isArray(template.animation['fonts']['list'])
      ? template.animation['fonts']['list']
      : [];
  const font = fontList.find((f) => record(f) && f['fName'] === style['f']);
  const resource = record(font)
    ? template.resources.find((r) => r.fontFamily === font['fFamily'])
    : null;
  const metrics = resource ? fontMetrics(resource) : null;
  if (!metrics) return null;
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  const fontSize = style['s'];
  const tracking = typeof style['tr'] === 'number' ? (style['tr'] * style['s']) / 1000 : 0;
  const widths = lines.map((line) => {
    const count = [...line.normalize('NFD')].length;
    return (
      (count * metrics.advance * fontSize) / metrics.em +
      Math.max(0, count - 1) * Math.abs(tracking)
    );
  });
  const width = Math.max(0, ...widths),
    scale = style['s'] / metrics.em;
  const left = style['j'] === 1 ? -width : style['j'] === 2 ? -width / 2 : 0;
  return {
    x: left + Math.min(0, metrics.left) * scale,
    right: left + width + Math.max(0, metrics.right) * scale,
    y: -metrics.top * scale,
    bottom:
      (lines.length - 1) * (typeof style['lh'] === 'number' ? style['lh'] : style['s'] * 1.2) -
      metrics.bottom * scale,
  };
}
function shapeBounds(items: unknown, template: AnimationTemplate, controls: Controls): Box | null {
  if (!Array.isArray(items)) return null;
  let result: Box | null = null,
    ks: unknown;
  let stroke = 0;
  for (const item of items) {
    if (!record(item)) return null;
    let box: Box | null = null;
    if (item['ty'] === 'tr') ks = item;
    else if (item['ty'] === 'gr') box = shapeBounds(item['it'], template, controls);
    else if (item['ty'] === 'rc' || item['ty'] === 'el') {
      const p = propertyValues(item['p']),
        s = propertyValues(item['s']);
      if (!p || !s) return null;
      const px = p['map']((v) => v[0]!),
        py = p['map']((v) => v[1]!),
        sx = s.map((v) => Math.abs(v[0]!)),
        sy = s.map((v) => Math.abs(v[1]!));
      box = {
        x: Math.min(...px) - Math.max(...sx) / 2,
        y: Math.min(...py) - Math.max(...sy) / 2,
        right: Math.max(...px) + Math.max(...sx) / 2,
        bottom: Math.max(...py) + Math.max(...sy) / 2,
      };
    } else if (
      item['ty'] === 'sh' &&
      record(item['ks']) &&
      item['ks']['a'] !== 1 &&
      record(item['ks']['k'])
    ) {
      const path = item['ks']['k'];
      if (!Array.isArray(path['v']) || !Array.isArray(path['i']) || !Array.isArray(path['o']))
        return null;
      const points: number[][] = [];
      for (let i = 0; i < path['v'].length; i++) {
        const v: unknown = path['v'][i];
        const a: unknown = path['i'][i];
        const b: unknown = path['o'][i];
        if (!vector(v) || !vector(a) || !vector(b)) return null;
        points.push(v, [v[0]! + a[0]!, v[1]! + a[1]!], [v[0]! + b[0]!, v[1]! + b[1]!]);
      }
      if (points.length)
        box = {
          x: Math.min(...points.map((p) => p[0]!)),
          y: Math.min(...points.map((p) => p[1]!)),
          right: Math.max(...points.map((p) => p[0]!)),
          bottom: Math.max(...points.map((p) => p[1]!)),
        };
    } else if (item['ty'] === 'st') {
      const values = propertyValues(item['w']);
      if (!values) return null;
      stroke = Math.max(
        stroke,
        ...values.map(
          (v) => Math.abs(v[0]!) * Math.max(1, typeof item['ml'] === 'number' ? item['ml'] : 4)
        )
      );
    } else if (!['fl', 'tm'].includes(typeof item['ty'] === 'string' ? item['ty'] : ''))
      return null;
    if (box) result = result ? union(result, box) : box;
  }
  if (!result) return null;
  result = {
    x: result.x - stroke,
    y: result.y - stroke,
    right: result.right + stroke,
    bottom: result.bottom + stroke,
  };
  return ks ? transform(result, ks, template, controls) : result;
}

/** Bounds of content attached to declared movable handles. Unsupported Lottie constructs retain authored padding. */
export function attachedAnimationBounds(
  template: AnimationTemplate,
  controls: Controls
): Box | null {
  const slots = new Set(
    template.bindings
      .filter(
        (b) =>
          b.kind === 'vector' &&
          template.objectLayout?.handles?.some(
            (h) => h.xControl === b.xControl && h.yControl === b.yControl
          )
      )
      .map((b) => b.slot)
  );
  if (!slots.size) return null;
  const layers = template.animation.layers.filter(record);
  const byId = new Map(layers.map((l) => [l['ind'], l]));
  let result: Box | null = null;
  for (const layer of layers) {
    if (layer['ty'] !== 5 && layer['ty'] !== 4) continue;
    const chain: Json[] = [];
    let cursor: Json | undefined = layer,
      attached = false;
    while (cursor && chain.length <= layers.length) {
      chain.push(cursor);
      if (
        record(cursor['ks']) &&
        record(cursor['ks']['p']) &&
        typeof cursor['ks']['p']['sid'] === 'string' &&
        slots.has(cursor['ks']['p']['sid'])
      )
        attached = true;
      cursor = byId.get(cursor['parent']);
    }
    if (!attached || cursor) continue;
    let box =
      layer['ty'] === 5
        ? textBounds(layer, template, controls)
        : shapeBounds(layer['shapes'], template, controls);
    for (const parent of chain) {
      if (!box || parent['ddd'] || parent['ef']) {
        box = null;
        break;
      }
      box = transform(box, parent['ks'], template, controls);
    }
    if (box && Object.values(box).every(Number.isFinite))
      result = result ? union(result, box) : box;
  }
  return result;
}
