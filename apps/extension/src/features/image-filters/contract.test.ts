import { sourceImageFilterPlaneSize } from './contract';
import { expect, it } from 'vitest';
import {
  createSourceImageFilter,
  hasSourceImageFilters,
  parseSourceImageFilterStack,
} from './contract';
it('retains order, IDs, disabled values and independent parameters without mutating input', () => {
  const input = {
    version: 1,
    filters: [
      createSourceImageFilter('blur', 'blur'),
      { ...createSourceImageFilter('color', 'color'), enabled: false },
    ],
  };
  const before = structuredClone(input),
    parsed = parseSourceImageFilterStack(input)!;
  expect(parsed).toEqual(input);
  expect(input).toEqual(before);
  expect(parsed.filters).not.toBe(input.filters);
});
it.each([
  null,
  {},
  { version: 2, filters: [] },
  { version: 1, filters: [{ ...createSourceImageFilter('blur', 'one'), kind: 'shader' }] },
  {
    version: 1,
    filters: [createSourceImageFilter('blur', 'same'), createSourceImageFilter('color', 'same')],
  },
  { version: 1, filters: [{ ...createSourceImageFilter('blur', 'one'), intensity: NaN }] },
  {
    version: 1,
    filters: [{ ...createSourceImageFilter('blur', 'one'), parameters: { radius: 65 } }],
  },
  { version: 1, filters: [{ ...createSourceImageFilter('color', 'one'), shader: 'remote' }] },
  {
    version: 1,
    filters: Array.from({ length: 17 }, (_, i) => createSourceImageFilter('blur', String(i))),
  },
])('refuses unknown or malformed authored filter stack %j', (value) => {
  expect(parseSourceImageFilterStack(value)).toBeNull();
});
it('treats disabled/intensity zero/neutral values as no work without erasing authored controls', () => {
  const color = createSourceImageFilter('color', 'color');
  expect(hasSourceImageFilters({ version: 1, filters: [color] })).toBe(false);
  const blur = createSourceImageFilter('blur', 'blur');
  expect(hasSourceImageFilters({ version: 1, filters: [blur] })).toBe(true);
  expect(hasSourceImageFilters({ version: 1, filters: [{ ...blur, intensity: 0 }] })).toBe(false);
  expect(hasSourceImageFilters({ version: 1, filters: [{ ...blur, enabled: false }] })).toBe(false);
});

it.each([0, 90, 180, 270] as const)(
  'maps the display extent back to the source filter plane for %s degrees',
  (rotation) => {
    const display = { width: 640, height: 360 },
      plane = sourceImageFilterPlaneSize(display, rotation);
    expect(plane).toEqual(
      rotation === 90 || rotation === 270 ? { width: 360, height: 640 } : display
    );
    expect(plane).not.toBe(display);
    expect(display).toEqual({ width: 640, height: 360 });
  }
);

it.each(['monochrome', 'sepia', 'sharpen', 'pixelate', 'vignette', 'grain'] as const)(
  'retains the known %s operation and rejects extra executable fields',
  (kind) => {
    const entry = createSourceImageFilter(kind, kind),
      input = { version: 1, filters: [entry] };
    expect(parseSourceImageFilterStack(input)).toEqual(input);
    expect(
      parseSourceImageFilterStack({ version: 1, filters: [{ ...entry, source: 'code' }] })
    ).toBeNull();
    expect(hasSourceImageFilters({ version: 1, filters: [entry] })).toBe(true);
    expect(hasSourceImageFilters({ version: 1, filters: [{ ...entry, intensity: 0 }] })).toBe(
      false
    );
  }
);
it.each([-1, 0.5, 4294967296, NaN])('refuses invalid saved grain seed %s', (seed) => {
  expect(
    parseSourceImageFilterStack({
      version: 1,
      filters: [
        { ...createSourceImageFilter('grain', 'grain'), parameters: { amount: 0.1, seed } },
      ],
    })
  ).toBeNull();
});
