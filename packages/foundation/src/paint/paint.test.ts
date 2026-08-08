import { describe, expect, it } from 'vitest';
import {
  addGradientStop,
  arePaintsEqual,
  clonePaint,
  createGradientPaint,
  convertPaintType,
  distributeGradientStops,
  getRepresentativeColor,
  instantiatePaint,
  normalizePaint,
  paintToSolid,
  parsePaint,
  removeGradientStop,
  reverseGradient,
  sampleGradient,
  serializePaintToCss,
  updateGradientStop,
  type Gradient,
  type PaintInterpolationSpace,
} from '.';

const ids = (prefix = 'stop') => {
  let id = 0;
  return () => `${prefix}-${++id}`;
};

function linearGradient(): Gradient {
  const paint = createGradientPaint('#00000000', ids(), 'linear');
  if (paint.kind !== 'gradient') throw new Error('Expected gradient');
  return updateGradientStop(paint.gradient, paint.gradient.stops[1]!.id, {
    color: '#0000ffff',
  });
}

describe('Paint boundaries', () => {
  it('normalizes RGBA and rejects missing or duplicate stop IDs and malformed geometry', () => {
    const paint = createGradientPaint('#fff', ids());
    expect(paint.kind === 'gradient' && paint.gradient.stops[0]?.color).toBe('#ffffffff');
    if (paint.kind !== 'gradient') return;
    const duplicate = structuredClone(paint);
    duplicate.gradient.stops[1]!.id = duplicate.gradient.stops[0]!.id;
    expect(parsePaint(duplicate)).toBeNull();
    const missing = {
      ...paint,
      gradient: {
        ...paint.gradient,
        stops: paint.gradient.stops.map((stop, index) =>
          index === 0
            ? { color: stop.color, midpoint: stop.midpoint, position: stop.position }
            : stop
        ),
      },
    };
    expect(parsePaint(missing)).toBeNull();
    expect(parsePaint({ ...paint, gradient: { ...paint.gradient, angle: Number.NaN } })).toBeNull();
  });

  it('normalizes angles, coordinates, radius, midpoint and repeat span', () => {
    const paint = createGradientPaint('#fff', ids(), 'radial');
    if (paint.kind !== 'gradient' || paint.gradient.type !== 'radial') return;
    const parsed = parsePaint({
      ...paint,
      gradient: {
        ...paint.gradient,
        center: { x: -2, y: 4 },
        radius: { x: 3, y: 0 },
        repeat: { enabled: true, span: 4 },
        stops: paint.gradient.stops.map((stop) => ({ ...stop, midpoint: 0 })),
      },
    });
    expect(parsed).toMatchObject({
      gradient: {
        center: { x: 0, y: 1 },
        radius: { x: 1, y: 0.01 },
        repeat: { enabled: true, span: 1 },
        stops: [{ midpoint: 0.01 }, { midpoint: 0.01 }],
      },
    });
  });

  it('rejects a non-string gradient discriminator without invoking coercion', () => {
    const paint = createGradientPaint('#fff', ids('discriminator'));
    if (paint.kind !== 'gradient') throw new Error('Expected gradient');
    const type = {
      toString: () => {
        throw new Error('untrusted coercion invoked');
      },
    };
    expect(() => parsePaint({ ...paint, gradient: { ...paint.gradient, type } })).not.toThrow();
    expect(parsePaint({ ...paint, gradient: { ...paint.gradient, type } })).toBeNull();
  });

  it('keeps forgiving normalization explicit while canonical cloning rejects malformed Paint', () => {
    const malformed = { kind: 'solid' as const, color: undefined as never };
    expect(normalizePaint(malformed)).toEqual({ kind: 'solid', color: '#00000000' });
    expect(() => clonePaint(malformed)).toThrow('invalid canonical Paint');
  });
});

describe('Paint interpolation and operations', () => {
  it('uses stable hard-stop ordering and selects the last stop on an exact hit', () => {
    let gradient = linearGradient();
    gradient = updateGradientStop(gradient, gradient.stops[1]!.id, {
      color: '#ffffffff',
      position: 0.5,
    });
    gradient = addGradientStop(gradient, 0.5, ids('hard'));
    const lastExact = gradient.stops.findLast((stop) => stop.position === 0.5)!;
    expect(sampleGradient(gradient, 0.5)).toBe(lastExact.color);
  });

  it('uses premultiplied alpha in every interpolation space', () => {
    for (const interpolation of [
      'srgb',
      'srgb-linear',
      'oklab',
      'oklch',
    ] satisfies PaintInterpolationSpace[]) {
      const gradient = { ...linearGradient(), interpolation };
      const sampled = sampleGradient(gradient, 0.5);
      expect(sampled.slice(-2)).toBe('80');
      if (interpolation === 'srgb') expect(sampled).toBe('#0000ff80');
    }
  });

  it('clamps edits, retains two stops, reverses, distributes and re-identifies preset copies', () => {
    let gradient = linearGradient();
    gradient = addGradientStop(gradient, 0.3, ids('added'));
    const editedId = gradient.stops[1]!.id;
    gradient = updateGradientStop(gradient, editedId, { position: 2, midpoint: 0 });
    expect(gradient.stops.find((stop) => stop.id === editedId)).toMatchObject({
      position: 1,
      midpoint: 0.01,
    });
    expect(distributeGradientStops(gradient).stops.map((stop) => stop.position)).toEqual([
      0, 0.5, 1,
    ]);
    expect(reverseGradient(gradient).stops.map((stop) => stop.position)).toEqual([0, 0, 1]);
    expect(
      removeGradientStop(removeGradientStop(gradient, gradient.stops[0]!.id), gradient.stops[1]!.id)
        .stops
    ).toHaveLength(2);
    const source = { kind: 'gradient' as const, gradient };
    const copy = instantiatePaint(source, ids('copy'));
    expect(arePaintsEqual(source, copy)).toBe(true);
    expect(copy).not.toEqual(source);
  });

  it('covers type conversion, invalid input fallback and the maximum stop guard', () => {
    const fallback = createGradientPaint('not-a-color', ids('fallback'));
    expect(fallback).toMatchObject({
      kind: 'gradient',
      gradient: { stops: [{ color: '#000000ff' }, { color: '#000000ff' }] },
    });
    const radial = convertPaintType(fallback, 'radial', ids('radial'));
    expect(
      convertPaintType({ kind: 'solid', color: '#123456ff' }, 'radial', ids('solid'))
    ).toMatchObject({ kind: 'gradient', gradient: { type: 'radial' } });
    expect(instantiatePaint({ kind: 'solid', color: '#123456ff' }, ids('solid-copy'))).toEqual({
      kind: 'solid',
      color: '#123456ff',
    });
    const conic = convertPaintType(radial, 'conic', ids('conic'));
    const linear = convertPaintType(conic, 'linear', ids('linear'));
    expect(radial).toMatchObject({ kind: 'gradient', gradient: { type: 'radial' } });
    expect(conic).toMatchObject({ kind: 'gradient', gradient: { type: 'conic' } });
    expect(linear).toMatchObject({ kind: 'gradient', gradient: { type: 'linear' } });
    expect(convertPaintType(linear, 'linear', ids('same'))).toEqual(linear);
    expect(paintToSolid(linear)).toMatchObject({ kind: 'solid' });

    if (linear.kind !== 'gradient') return;
    let full = linear.gradient;
    while (full.stops.length < 16) full = addGradientStop(full, 0.5, ids('full'));
    expect(addGradientStop(full, 0.25, ids('overflow'))).toEqual(full);
    expect(updateGradientStop(full, 'missing', { color: '#fff' })).toEqual(full);
  });
});

describe('Paint serialization', () => {
  it('serializes all supported gradient types, hints and repeating spans from canonical data', () => {
    const linear = linearGradient();
    linear.stops[0]!.midpoint = 0.25;
    linear.repeat = { enabled: true, span: 0.4 };
    expect(serializePaintToCss({ kind: 'gradient', gradient: linear })).toMatch(
      /^repeating-linear-gradient\(/
    );
    for (const type of ['radial', 'conic'] as const) {
      const paint = createGradientPaint('#abcdef80', ids(type), type);
      expect(serializePaintToCss(paint).startsWith(`${type}-gradient(`)).toBe(true);
      expect(getRepresentativeColor(paint)).toBe('#abcdef80');
    }
  });

  it('canonicalizes untrusted model strings before generating CSS', () => {
    const paint = createGradientPaint('#000', ids('safe'));
    if (paint.kind !== 'gradient') throw new Error('Expected gradient');
    paint.gradient.stops[0]!.color =
      'rgb(0,0,0));background-image:url(https://attacker.invalid/pixel);/*';
    const css = serializePaintToCss(paint);
    expect(css).not.toContain('url(');
    expect(css).not.toContain('background-image');
    expect(css === 'transparent' || css.includes('#000000ff')).toBe(true);
  });
});
