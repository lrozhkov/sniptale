import { rgbToOklab } from '@sniptale/foundation/paint';
import { parseColor, formatHexColor } from '@sniptale/foundation/color';
import cssValues from 'color-name';
export type CatalogColor = {
  name: string;
  hex: string;
  source: 'names' | 'css';
  aliases?: string[];
};
export const families = [
  { id: 'red', h: 25, hex: '#de4b52' },
  { id: 'orange', h: 55, hex: '#ed963e' },
  { id: 'yellow', h: 95, hex: '#e4cf4e' },
  { id: 'green', h: 145, hex: '#65aa66' },
  { id: 'cyan', h: 195, hex: '#4caeb5' },
  { id: 'blue', h: 255, hex: '#568dd9' },
  { id: 'violet', h: 295, hex: '#9c72d6' },
  { id: 'pink', h: 340, hex: '#d778b1' },
  { id: 'neutral', h: 0, hex: '#929292' },
] as const;
type Lab = readonly [number, number, number];
type FamilyId = (typeof families)[number]['id'];

export function lab(hex: string): Lab {
  const [red = 0, green = 0, blue = 0] = (hex.slice(1, 7).match(/../g) ?? []).map(
    (value) => parseInt(value, 16) / 255
  );
  return rgbToOklab([red, green, blue]);
}
const cache = new Map<string, Lab>();
export function coordinates(hex: string) {
  let value = cache.get(hex);
  if (!value) {
    value = lab(hex);
    cache.set(hex, value);
  }
  return value;
}
export function distance(a: Lab, b: Lab) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
const familyCache = new Map<string, FamilyId>();
export function family(c: CatalogColor) {
  const cached = familyCache.get(c.hex);
  if (cached) return cached;
  const [, a, b] = coordinates(c.hex);
  if (Math.hypot(a, b) < 0.035) {
    familyCache.set(c.hex, 'neutral');
    return 'neutral';
  }
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const value = families.slice(0, 8).reduce((best, f) => {
    const delta = (v: number) => Math.abs(((h - v + 540) % 360) - 180);
    return delta(f.h) < delta(best.h) ? f : best;
  }).id;
  familyCache.set(c.hex, value);
  return value;
}
export function ordered(pool: CatalogColor[]) {
  return [...pool].sort((a, b) => {
    const fa = families.findIndex((f) => f.id === family(a)),
      fb = families.findIndex((f) => f.id === family(b));
    const ca = coordinates(a.hex),
      cb = coordinates(b.hex);
    return (
      fa - fb ||
      cb[0] - ca[0] ||
      Math.hypot(cb[1], cb[2]) - Math.hypot(ca[1], ca[2]) ||
      a.hex.localeCompare(b.hex)
    );
  });
}
export function overview(pool: CatalogColor[], group: string) {
  const result: CatalogColor[] = [];
  const used = new Set<string>();
  const columns =
    group === 'all'
      ? families.slice(0, 8)
      : Array.from({ length: 8 }, (_, i) => ({
          ...families.find((f) => f.id === group)!,
          chroma: 0.025 + i * 0.025,
        }));
  for (const lightness of [0.92, 0.8, 0.68, 0.56, 0.44, 0.32])
    for (const f of columns) {
      const chroma = 'chroma' in f ? Number(f.chroma) : 0.12;
      const angle = (f.h * Math.PI) / 180;
      const target: Lab = [
        lightness,
        f.id === 'neutral' ? 0 : chroma * Math.cos(angle),
        f.id === 'neutral' ? 0 : chroma * Math.sin(angle),
      ];
      let best: CatalogColor | undefined;
      let score = Infinity;
      for (const c of pool) {
        if (used.has(c.hex) || family(c) !== f.id) continue;
        const d = distance(coordinates(c.hex), target);
        if (d < score) {
          score = d;
          best = c;
        }
      }
      if (best) {
        used.add(best.hex);
        result.push(best);
      }
    }
  return result;
}
export function nearby(pool: CatalogColor[], hex: string) {
  const anchor = coordinates(hex);
  const unique = [...new Map(pool.map((c) => [c.hex, c])).values()];
  const sorted = unique
    .filter((c) => c.hex.toLowerCase() !== hex.slice(0, 7).toLowerCase())
    .map((c) => ({ c, d: distance(coordinates(c.hex), anchor) }))
    .sort((a, b) => a.d - b.d);
  const chosen: CatalogColor[] = [];
  // Separate visible alternatives so 32k entries do not produce six nearly identical RGB values.
  for (const { c, d } of sorted) {
    if (chosen.length === 6) break;
    if (d > 0.18) break;
    if (chosen.every((v) => distance(coordinates(c.hex), coordinates(v.hex)) >= 0.025))
      chosen.push(c);
  }
  return chosen;
}

export const cssCatalog: CatalogColor[] = Object.entries(cssValues).map(([name, rgb]) => ({
  name,
  source: 'css',
  hex: '#' + rgb.map((value) => value.toString(16).padStart(2, '0')).join(''),
}));

export function createNamedCatalog(
  colors: readonly { name: string; hex: string }[]
): CatalogColor[] {
  const merged = new Map<string, CatalogColor>(
    colors.map((color) => [color.hex.toLowerCase(), { ...color, source: 'names' }])
  );
  for (const color of cssCatalog) {
    const existing = merged.get(color.hex);
    if (existing) existing.aliases = [...(existing.aliases ?? []), color.name];
    else merged.set(color.hex, color);
  }
  return ordered([...merged.values()]);
}

export function colorIdentity(value: string): string | null {
  const parsed = parseColor(value);
  return parsed ? formatHexColor(parsed).slice(0, 7).toLowerCase() : null;
}

export function getCssColorName(value: string): string | undefined {
  const hex = colorIdentity(value);
  return cssCatalog.find((color) => color.hex === hex)?.name;
}

export function colorHint(value: string, names: Readonly<Record<string, string>> = {}): string {
  const hex = colorIdentity(value);
  const name = (hex ? names[hex] : undefined) ?? getCssColorName(value);
  return name ? `${name} · ${value.toUpperCase()}` : value.toUpperCase();
}

export const normalizeCatalogQuery = (value: string) => value.toLowerCase().replace(/[\s#_-]/g, '');
export function filterCatalog(
  pool: readonly CatalogColor[],
  query: string,
  group: string
): CatalogColor[] {
  const normalized = normalizeCatalogQuery(query);
  return pool
    .filter(
      (color) =>
        (group === 'all' || family(color) === group) &&
        (!normalized ||
          normalizeCatalogQuery(
            `${color.name}${color.aliases?.join('') ?? ''}${color.hex}`
          ).includes(normalized))
    )
    .sort(
      (a, b) =>
        Number(
          normalizeCatalogQuery(b.name) === normalized ||
            normalizeCatalogQuery(b.hex) === normalized
        ) -
        Number(
          normalizeCatalogQuery(a.name) === normalized ||
            normalizeCatalogQuery(a.hex) === normalized
        )
    );
}
