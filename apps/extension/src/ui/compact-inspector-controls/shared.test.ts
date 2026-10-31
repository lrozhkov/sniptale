import { expect, it, vi } from 'vitest';
import { parseCompactNumber, resolveCompactUnitLabel } from './shared';
const locale = vi.hoisted(() => ({ value: 'en' }));
vi.mock('../../platform/i18n', () => ({
  translate: (key: string) =>
    key === 'common.units.count' ? (locale.value === 'ru' ? 'шт.' : 'items') : key,
}));
it('keeps numeric units outside raw values, including localized counts and multipliers', () => {
  for (const [unit, label] of [
    ['%', '%'],
    ['px', 'px'],
    ['s', 's'],
    ['ms', 'ms'],
    ['deg', '°'],
    ['ratio', '×'],
    ['count', 'items'],
  ] as const) {
    const compact = unit;
    expect(resolveCompactUnitLabel(compact)).toBe(label);
    expect(parseCompactNumber(`20 ${label}`, compact)).toBe(20);
  }
  locale.value = 'ru';
  expect(resolveCompactUnitLabel('count')).toBe('шт.');
  expect(parseCompactNumber('20 шт.', 'count')).toBe(20);
});
