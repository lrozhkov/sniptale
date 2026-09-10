import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  parseEffectV1Source,
  applyEffectV1ControlPreset,
  resolveEffectV1ControlDefault,
} from '@sniptale/runtime-contracts/effect-v1';
import {
  applyInitialEffectPreset,
  collectEffectVisualValues,
  parseEffectPresetPreferences,
} from './presets';
const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json',
  'utf8'
);
const document = parseEffectV1Source(source).document!;
it('switches visual styles without changing text, geometry or pointer controls', () => {
  const current = Object.fromEntries(
    document.controls.map((control) => [control.id, resolveEffectV1ControlDefault(control, 'ru')])
  );
  current['title'] = 'Custom';
  const before = structuredClone(current);
  const next = applyEffectV1ControlPreset(document, current, 'sniptale-orange-light');
  for (const [id, value] of Object.entries(before)) {
    if (!(id in document.controlPresets![1]!.values)) expect(next[id]).toBe(value);
  }
  expect(current).toEqual(before);
  expect(next['title']).toBe('Custom');
  expect(() => applyEffectV1ControlPreset(document, current, 'missing')).toThrow();
});
it('validates user settings against the SDK protected-field boundary and applies defaults only at creation', () => {
  const values = document.controlPresets![0]!.values;
  const preferences = {
    presets: [{ id: 'mine', name: 'My style', values }],
    defaultPreset: { kind: 'user' as const, id: 'mine' },
  };
  expect(parseEffectPresetPreferences(source, preferences)).toEqual(preferences);
  expect(applyInitialEffectPreset(document, { title: 'Mine' }, preferences)).toEqual({
    title: 'Mine',
    ...values,
  });
  expect(
    applyInitialEffectPreset(document, { title: '' }, preferences, 'sniptale-orange-light')
  ).toEqual({
    title: '',
    ...document.controlPresets!.find((preset) => preset.id === 'sniptale-orange-light')!.values,
  });
  expect(
    applyInitialEffectPreset(document, { title: 'Explicit' }, preferences, 'user:mine')['title']
  ).toBe('Explicit');
  for (const invalid of [{ title: 'Overwrite' }, { unknown: 1 }, { ...values, title: '' }]) {
    expect(
      parseEffectPresetPreferences(source, {
        presets: [{ id: 'bad', name: 'Bad', values: invalid }],
      })
    ).toBeNull();
  }
  expect(
    parseEffectPresetPreferences(source, {
      ...preferences,
      defaultPreset: { kind: 'user', id: 'missing' },
    })
  ).toBeNull();
  expect(collectEffectVisualValues(document, { ...values, title: 'Do not save' })).toEqual(values);
});
