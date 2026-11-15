import { expect, it } from 'vitest';
import {
  applyEffectControlPreset,
  resolveEffectControlDefault,
  resolveEffectControlGroup,
  resolveEffectControlGroupIcons,
  resolveEffectLocaleText,
  isEffectLocaleTag,
  validateEffectControlPresetValues,
  type EffectControlContext,
} from './index.js';

const controls: EffectControlContext = {
  controls: [
    {
      id: 'title',
      kind: 'text',
      defaultValue: 'Title',
      localizedDefaultValue: { en: 'Title', ru: 'Заголовок' },
      group: 'content',
    },
    { id: 'accent', kind: 'color', defaultValue: '#ffffff', group: 'appearance' },
    { id: 'size', kind: 'number', defaultValue: 24, min: 12, max: 72, group: 'typography' },
    { id: 'tip', kind: 'number', defaultValue: 0, group: 'appearance' },
    {
      id: 'choice',
      kind: 'number',
      defaultValue: 1,
      min: 0,
      max: 1,
      group: 'animation',
      options: [
        { value: 0, label: { en: 'Off' } },
        { value: 1, label: { en: 'On' } },
      ],
    },
  ],
  objectLayout: { handles: [{ xControl: 'tip', yControl: 'tip' }] },
  controlPresets: [
    {
      id: 'dark',
      label: { en: 'Dark' },
      theme: { id: 'theme', label: { en: 'Theme' } },
      style: { id: 'style', label: { en: 'Style' } },
      values: { accent: '#123456', size: 32 },
    },
  ],
};

it('uses locale defaults only for creation and preserves stored text and anchors when applying a preset', () => {
  expect(resolveEffectControlDefault(controls.controls[0]!, 'ru-RU')).toBe('Заголовок');
  expect(resolveEffectControlDefault(controls.controls[1]!, 'ru')).toBe('#ffffff');
  const current = { title: '', tip: -0.5, size: 24, accent: '#ffffff' };
  expect(applyEffectControlPreset(controls, current, 'dark')).toEqual({
    ...current,
    size: 32,
    accent: '#123456',
  });
  expect(current).toEqual({ title: '', tip: -0.5, size: 24, accent: '#ffffff' });
  expect(() => applyEffectControlPreset(controls, current, 'missing')).toThrow(
    'Unknown control preset'
  );
});

it('rejects type, option, range, color, text and geometry overrides without mutating the snapshot', () => {
  const before = structuredClone(controls);
  for (const values of [
    null,
    [],
    {},
    { unknown: 1 },
    { title: 'replacement' },
    { tip: 1 },
    { size: Infinity },
    { size: 100 },
    { size: '32' },
    { accent: 'url(https://example.com)' },
    { choice: 0.5 },
  ])
    expect(validateEffectControlPresetValues(controls, values).ok).toBe(false);
  expect(
    validateEffectControlPresetValues(controls, { accent: 'rgba(12, 24, 36, .5)', choice: 0 }).ok
  ).toBe(true);
  expect(controls).toEqual(before);
});

it('resolves bounded group hierarchies, reserves root icons, and refuses ambiguous or cyclic groups', () => {
  const groups = [
    { id: 'body', label: { en: 'Body' }, parentId: 'appearance', icon: 'drawing' as const },
  ];
  expect(resolveEffectControlGroup('body', groups)).toBe('appearance');
  expect(resolveEffectControlGroup('missing', groups)).toBeNull();
  expect(resolveEffectControlGroup('body', [...groups, groups[0]!])).toBeNull();
  expect(
    resolveEffectControlGroup('a', [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ])
  ).toBeNull();
  expect(resolveEffectControlGroupIcons(groups, [{ group: 'body' }]).get(0)).toBe('drawing');
  expect(
    resolveEffectControlGroupIcons([{ ...groups[0], icon: 'palette' }], [{ group: 'body' }]).size
  ).toBe(0);
  expect(resolveEffectControlGroupIcons(null, [])).toEqual(new Map());
});

it('keeps RFC locale matching deterministic without using browser locale registries', () => {
  for (const locale of ['ru-RU', 'en', 'zh-Hant-TW', 'i-klingon', 'x-private'])
    expect(isEffectLocaleTag(locale)).toBe(true);
  for (const locale of ['', '__proto__', 'en--US', 'en-a', 'en-a-foo-a-bar'])
    expect(isEffectLocaleTag(locale)).toBe(false);
  expect(
    resolveEffectLocaleText({ en: 'English', ru: 'Русский', 'ru-RU': 'Точный' }, 'ru-RU')
  ).toBe('Точный');
  expect(resolveEffectLocaleText({ en: 'English', ru: 'Русский' }, 'ru-RU')).toBe('Русский');
  expect(resolveEffectLocaleText({ en: 'English' }, 'invalid!')).toBe('English');
});

it('admits closed metadata and rejects invalid values, locale keys, groups and presets', async () => {
  const { parseEffectControlSet } = await import('./index.js');
  const valid = {
    controls: [controls.controls[0], controls.controls[1], controls.controls[2]],
    controlPresets: controls.controlPresets,
    defaultControlPresetId: 'dark',
  };
  expect(parseEffectControlSet(valid)).toEqual(valid);
  expect(parseEffectControlSet(valid)).not.toBe(valid);
  const invalid = [
    { ...valid, executable: 'no' },
    { controls: [{ ...controls.controls[0], label: { ru: 'Без английского' } }] },
    { controls: [{ ...controls.controls[0], localizedDefaultValue: { en: ' ' } }] },
    { controls: [{ ...controls.controls[0], localizedDefaultValue: { ru: 'A', RU: 'B' } }] },
    { controls: [{ ...controls.controls[0], localizedDefaultValue: { bad_locale: 'A' } }] },
    { controls: [{ ...controls.controls[2], min: 100 }] },
    { controls: [{ ...controls.controls[2], presentation: 'text' }] },
    { controls: [{ ...controls.controls[2], unit: 'unknown' }] },
    { controls: [{ ...controls.controls[1], defaultValue: 'url(remote)' }] },
    { controls: [controls.controls[0], controls.controls[0]] },
    { controls: [{ ...controls.controls[0], group: 'missing' }] },
    {
      controls: [],
      controlGroups: [
        { id: 'a', parentId: 'b', label: { en: 'A' } },
        { id: 'b', parentId: 'a', label: { en: 'B' } },
      ],
    },
    {
      controls: [],
      controlGroups: [{ id: 'appearance', parentId: 'content', label: { en: 'A' } }],
    },
    { controls: [], defaultControlPresetId: 'missing' },
    {
      ...valid,
      controlPresets: [{ ...controls.controlPresets![0], values: { title: 'overwritten' } }],
    },
    { controls: [{ ...controls.controls[2], presentation: 'toggle' }] },
    {
      controls: [
        {
          ...controls.controls[2],
          options: [
            { value: 24, label: { en: 'A' } },
            { value: 24, label: { en: 'B' } },
          ],
        },
      ],
    },
  ];
  for (const value of invalid)
    expect(parseEffectControlSet(value), JSON.stringify(value)).toBeNull();
});

it('validates complete stored values without recreating missing text or applying defaults', async () => {
  const { parseEffectControlValues } = await import('./index.js');
  const current = { title: '', accent: '#ffffff', size: 32, tip: -1, choice: 1 };
  expect(parseEffectControlValues(controls, current)).toEqual(current);
  expect(parseEffectControlValues(controls, { ...current, choice: 3 })).toBeNull();
  expect(parseEffectControlValues(controls, { ...current, size: '32' })).toBeNull();
  expect(parseEffectControlValues(controls, { ...current, accent: 'url(external)' })).toBeNull();
  const { title: _title, ...missing } = current;
  expect(parseEffectControlValues(controls, missing)).toBeNull();
});
