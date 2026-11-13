import type { AnimationTemplate } from '@sniptale/runtime-contracts/animation-template';

type Interval = readonly [start: number, end: number];
type ContentKey = (canonicalFrame: number) => number;
const unchanged: ContentKey = (frame) => frame;
const rootKeys = new Set([
  'w',
  'h',
  'fr',
  'ip',
  'op',
  'layers',
  'v',
  'ddd',
  'nm',
  'assets',
  'fonts',
  'slots',
]);
const layerKeys = new Set([
  'ty',
  'ind',
  'parent',
  'ddd',
  'sr',
  'ip',
  'op',
  'st',
  'bm',
  'ao',
  'ks',
  't',
  'shapes',
  'nm',
  'hd',
]);
const shapeTypes = new Set(['gr', 'rc', 'el', 'sh', 'fl', 'st', 'tr']);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const keysWithin = (value: Record<string, unknown>, allowed: ReadonlySet<string>) =>
  Object.keys(value).every((key) => allowed.has(key));
const scalar = (value: unknown): value is [number] =>
  Array.isArray(value) &&
  value.length === 1 &&
  typeof value[0] === 'number' &&
  Number.isFinite(value[0]);

function opacityHolds(value: Record<string, unknown>): Interval[] | null {
  if (!keysWithin(value, new Set(['a', 'k', 'ix', 'sid'])) || !Array.isArray(value['k']))
    return null;
  const keys = value['k'];
  if (keys.length < 2 || keys.length > 256) return null;
  const frames: { time: number; start: number; end?: number; hold: boolean }[] = [];
  for (const key of keys) {
    if (
      !record(key) ||
      !keysWithin(key, new Set(['t', 's', 'e', 'h', 'i', 'o'])) ||
      typeof key['t'] !== 'number' ||
      !Number.isInteger(key['t']) ||
      !scalar(key['s']) ||
      (key['e'] !== undefined && !scalar(key['e'])) ||
      (key['h'] !== undefined && key['h'] !== 0 && key['h'] !== 1)
    )
      return null;
    for (const name of ['i', 'o']) {
      const tangent = key[name];
      if (tangent === undefined) continue;
      if (
        !record(tangent) ||
        !keysWithin(tangent, new Set(['x', 'y'])) ||
        ![tangent['x'], tangent['y']].every(
          (axis) => (typeof axis === 'number' && Number.isFinite(axis)) || scalar(axis)
        )
      )
        return null;
    }
    if (frames.length && frames[frames.length - 1]!.time >= key['t']) return null;
    frames.push({
      time: key['t'],
      start: key['s'][0],
      ...(scalar(key['e']) ? { end: key['e'][0] } : {}),
      hold: key['h'] === 1,
    });
  }
  const holds: Interval[] = [];
  for (let index = 0; index + 1 < frames.length; index++) {
    const current = frames[index]!;
    const next = frames[index + 1]!;
    if (
      (current.end === undefined || current.end === current.start) &&
      (current.hold || current.start === next.start)
    )
      holds.push([current.time, next.time]);
  }
  return holds;
}

function intersect(left: readonly Interval[], right: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  let a = 0,
    b = 0;
  while (a < left.length && b < right.length) {
    const l = left[a]!,
      r = right[b]!;
    const start = Math.max(l[0], r[0]),
      end = Math.min(l[1], r[1]);
    if (start < end) result.push([start, end]);
    if (l[1] <= r[1]) a++;
    else b++;
  }
  return result;
}

function staticLayers(animation: AnimationTemplate['animation']): boolean {
  if (animation.layers.length > 128) return false;
  const parents = new Map<number, number | undefined>();
  for (const layer of animation.layers) {
    if (
      !record(layer) ||
      !keysWithin(layer, layerKeys) ||
      typeof layer['ty'] !== 'number' ||
      ![3, 4, 5].includes(layer['ty']) ||
      !Number.isInteger(layer['ind']) ||
      typeof layer['ind'] !== 'number' ||
      parents.has(layer['ind']) ||
      (layer['parent'] !== undefined &&
        (typeof layer['parent'] !== 'number' || !Number.isInteger(layer['parent']))) ||
      (layer['ddd'] !== undefined && layer['ddd'] !== 0) ||
      (layer['sr'] !== undefined && layer['sr'] !== 1) ||
      (layer['st'] !== undefined && layer['st'] !== 0) ||
      (layer['ao'] !== undefined && layer['ao'] !== 0) ||
      layer['ip'] !== 0 ||
      typeof layer['op'] !== 'number' ||
      layer['op'] < animation.op
    )
      return false;
    parents.set(layer['ind'], layer['parent']);
  }
  for (const id of parents.keys()) {
    const seen = new Set<number>([id]);
    let parent = parents.get(id);
    while (parent !== undefined) {
      if (seen.has(parent) || !parents.has(parent)) return false;
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
  return true;
}

/** Derive cache identity only; unsupported timelines retain their actual canonical frame. */
export function createEffectRuntimeGpuContentKey(document: AnimationTemplate): ContentKey {
  const animation = document.animation;
  if (
    !keysWithin(animation, rootKeys) ||
    animation.ip !== 0 ||
    !Number.isInteger(animation.op) ||
    (animation['ddd'] !== undefined && animation['ddd'] !== 0) ||
    (animation['assets'] !== undefined &&
      (!Array.isArray(animation['assets']) || animation['assets'].length !== 0)) ||
    document.resources.some((resource) => !resource.mimeType.startsWith('font/')) ||
    !staticLayers(animation)
  )
    return unchanged;
  const pending: { value: unknown; key: string }[] = [{ value: animation, key: '' }];
  let budget = 4096;
  let keyframeBudget = 256;
  let holds: Interval[] | undefined;
  while (pending.length) {
    const { value, key } = pending.pop()!;
    if (--budget < 0) return unchanged;
    if (Array.isArray(value)) {
      if (value.length + pending.length > budget) return unchanged;
      for (const child of value) pending.push({ value: child, key });
      continue;
    }
    if (!record(value)) continue;
    if (typeof value['ty'] === 'string' && !shapeTypes.has(value['ty'])) return unchanged;
    if (key === 't' && Array.isArray(value['a']) && value['a'].length) return unchanged;
    if (value['a'] === 1) {
      if (key !== 'o' || !Array.isArray(value['k'])) return unchanged;
      keyframeBudget -= value['k'].length;
      if (keyframeBudget < 0) return unchanged;
      const intervals = opacityHolds(value);
      if (!intervals) return unchanged;
      holds = holds ? intersect(holds, intervals) : intervals;
      if (!holds.length) return unchanged;
      continue;
    }
    // Static text documents use keyframe-shaped data without animated interpolation.
    const keys = value['k'];
    if (Array.isArray(keys) && keys.some((item) => record(item) && 't' in item)) {
      if (
        keys.length !== 1 ||
        !record(keys[0]) ||
        keys[0]['t'] !== 0 ||
        !record(keys[0]['s']) ||
        typeof keys[0]['s']['t'] !== 'string' ||
        !keysWithin(keys[0], new Set(['t', 's'])) ||
        (value['a'] !== undefined && value['a'] !== 0)
      )
        return unchanged;
    }
    const entries = Object.entries(value);
    if (entries.length + pending.length > budget) return unchanged;
    for (const [childKey, child] of entries) pending.push({ value: child, key: childKey });
  }
  if (!holds?.length) return unchanged;
  const intervals = holds;
  return (frame) => {
    for (const [start, end] of intervals) if (frame >= start && frame < end) return start;
    return frame;
  };
}
