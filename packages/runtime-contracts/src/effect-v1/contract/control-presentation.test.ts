import { expect, it } from 'vitest';
import { createEffectV1Diagnostics } from '../model/diagnostics';
import { validateEffectV1Controls } from '../validation/scene';

const control = {
  id: 'sequence',
  kind: 'number',
  defaultValue: 0,
  min: 0,
  max: 1,
  group: 'animation',
  order: 2,
  options: [
    { value: 0, label: { en: 'Line first' } },
    { value: 1, label: { en: 'Text first' } },
  ],
};
function diagnostics(value: unknown) {
  const report = createEffectV1Diagnostics();
  validateEffectV1Controls([value], report);
  return report.diagnostics;
}
it('accepts explicit group, order and localized numeric options without template identity', () => {
  expect(diagnostics(control)).toEqual([]);
});
it('preserves unknown groups with an explicit compatibility warning', () => {
  expect(diagnostics({ ...control, group: 'future-group' }).map((d) => d.code)).toEqual([
    'CONTROL_GROUP_UNKNOWN',
  ]);
});
it('rejects malformed options and missing English fallback', () => {
  expect(
    diagnostics({
      ...control,
      order: -1,
      options: [
        { value: 0, label: { ru: 'Первый' } },
        { value: 0, label: { en: 'Duplicate' } },
      ],
    }).map((d) => d.code)
  ).toEqual(
    expect.arrayContaining(['CONTROL_ORDER', 'LOCALE_EN_REQUIRED', 'CONTROL_OPTION_DUPLICATE'])
  );
  expect(diagnostics({ ...control, defaultValue: 0.5 }).map((d) => d.code)).toContain(
    'CONTROL_OPTION_DEFAULT'
  );
  expect(
    diagnostics({
      ...control,
      options: [
        { value: '0', label: { en: 'Wrong' } },
        { value: 2, label: { en: 'Outside' } },
      ],
    }).map((d) => d.code)
  ).toContain('CONTROL_OPTION_VALUE');
});

it('accepts English-only documents and regional language tags with deterministic fallback', async () => {
  const { validateLocaleText } = await import('../validation/shared');
  const { resolveEffectLocaleText } = await import('../model/locale');
  const report = createEffectV1Diagnostics();
  const label = { en: 'English', zh: 'Chinese', 'zh-Hant-TW': 'Traditional' };
  validateLocaleText(label, '$.label', true, report);
  expect(report.diagnostics).toEqual([]);
  expect(resolveEffectLocaleText(label, 'zh-hant-tw')).toBe('Traditional');
  expect(resolveEffectLocaleText(label, 'zh-CN')).toBe('Chinese');
  expect(resolveEffectLocaleText(label, 'ru')).toBe('English');
  expect(resolveEffectLocaleText(undefined, 'en')).toBe('');
  expect(resolveEffectLocaleText({}, 'en')).toBe('');
  validateLocaleText({ en: 'OK', xx_bad: 'bad' }, '$.label', false, report);
  expect(report.diagnostics.map((d) => d.code)).toContain('LOCALE_ENTRY');
});
