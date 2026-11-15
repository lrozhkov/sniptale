import { expect, it, vi } from 'vitest';
import { parseCompactNumber, resolveCompactUnitLabel } from './shared';
const locale = vi.hoisted(() => ({ value: 'en' }));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) =>
    key === 'common.units.seconds'
      ? locale.value === 'ru'
        ? 'с'
        : 's'
      : key === 'common.units.db'
        ? locale.value === 'ru'
          ? 'дБ'
          : 'dB'
        : key === 'common.units.semitones'
          ? locale.value === 'ru'
            ? 'полут.'
            : 'st'
          : key === 'common.units.count'
            ? locale.value === 'ru'
              ? 'шт.'
              : 'items'
            : key === 'common.units.hz'
              ? locale.value === 'ru'
                ? 'Гц'
                : 'Hz'
              : key,
}));
it('keeps numeric units outside raw values, including localized counts and multipliers', () => {
  for (const [unit, label] of [
    ['%', '%'],
    ['px', 'px'],
    ['s', 's'],
    ['ms', 'ms'],
    ['hz', 'Hz'],
    ['deg', '°'],
    ['ratio', '×'],
    ['count', 'items'],
    ['db', 'dB'],
    ['semitones', 'st'],
  ] as const) {
    const compact = unit;
    expect(resolveCompactUnitLabel(compact)).toBe(label);
    expect(parseCompactNumber(`20 ${label}`, compact)).toBe(20);
  }
  locale.value = 'ru';
  expect(resolveCompactUnitLabel('s')).toBe('с');
  expect(parseCompactNumber('2.125 с', 's')).toBe(2.125);
  expect(resolveCompactUnitLabel('db')).toBe('дБ');
  expect(parseCompactNumber('-2.5 дБ', 'db')).toBe(-2.5);
  expect(resolveCompactUnitLabel('semitones')).toBe('полут.');
  expect(parseCompactNumber('7.5 полут.', 'semitones')).toBe(7.5);
  expect(resolveCompactUnitLabel('hz')).toBe('Гц');
  expect(parseCompactNumber('20 Гц', 'hz')).toBe(20);
  expect(resolveCompactUnitLabel('count')).toBe('шт.');
  expect(parseCompactNumber('20 шт.', 'count')).toBe(20);
});
