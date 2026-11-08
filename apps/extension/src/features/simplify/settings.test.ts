import { expect, it } from 'vitest';
import { createDefaultSimplifySettings, parseSimplifySettings } from './settings';

it('defaults to automatic text-only and retains the inactive manual choice', () => {
  const initial = createDefaultSimplifySettings();
  expect(initial).toEqual({
    automatic: true,
    content: 'text',
    manualKind: 'text',
    sensitivity: 55,
    thickness: 0.5,
    lineSpacing: 1.5,
    color: null,
  });
  const image = { ...initial, automatic: false, manualKind: 'image' as const };
  expect(parseSimplifySettings({ ...image, automatic: true })).toMatchObject({
    automatic: true,
    manualKind: 'image',
  });
  expect(createDefaultSimplifySettings()).not.toBe(initial);
});

it('admits standard picker colors and rejects malformed or unsupported settings', () => {
  const defaults = createDefaultSimplifySettings();
  expect(parseSimplifySettings({ ...defaults, color: 'rgb(12, 34, 56)' })?.color).toBe('#0c2238');
  for (const invalid of [
    null,
    [],
    {},
    { ...defaults, automatic: 1 },
    { ...defaults, content: 'images' },
    { ...defaults, manualKind: 'icon' },
    { ...defaults, sensitivity: 54 },
    { ...defaults, thickness: NaN },
    { ...defaults, lineSpacing: 0 },
    { ...defaults, lineSpacing: 1.25 },
    { ...defaults, lineSpacing: null },
    { ...defaults, color: 'transparent' },
    { ...defaults, color: '#11223380' },
    { ...defaults, color: 'url(https://invalid)' },
  ]) {
    expect(parseSimplifySettings(invalid)).toBeNull();
  }
});

it('defaults legacy settings to normal spacing and retains each explicit interval', () => {
  const { lineSpacing: omitted, ...legacy } = createDefaultSimplifySettings();
  expect(omitted).toBe(1.5);
  expect(parseSimplifySettings(legacy)?.lineSpacing).toBe(1.5);
  for (const lineSpacing of [1, 1.5, 2])
    expect(parseSimplifySettings({ ...legacy, lineSpacing })?.lineSpacing).toBe(lineSpacing);
});
