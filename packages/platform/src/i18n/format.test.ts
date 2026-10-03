import { afterEach, expect, it, vi } from 'vitest';
import { formatDateTime, formatNumber } from './format';

afterEach(() => vi.restoreAllMocks());

it('reuses equivalent date and number formatters without changing localized output', () => {
  const date = new Date('2026-10-03T10:00:00Z');
  const dateOptions = { timeZone: 'UTC', year: 'numeric', month: 'long' } as const;
  const numberOptions = { maximumFractionDigits: 3, minimumFractionDigits: 1 };
  const expectedDate = new Intl.DateTimeFormat('en-US', dateOptions).format(date);
  const expectedNumber = new Intl.NumberFormat('en-US', numberOptions).format(1234.56);
  const NativeDate = Intl.DateTimeFormat;
  const NativeNumber = Intl.NumberFormat;
  const dates = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locales, options) {
    return new NativeDate(locales, options);
  });
  const numbers = vi.spyOn(Intl, 'NumberFormat').mockImplementation(function (locales, options) {
    return new NativeNumber(locales, options);
  });
  for (let i = 0; i < 20; i += 1) {
    expect(formatDateTime(date, { ...dateOptions }, 'en')).toBe(expectedDate);
    expect(formatNumber(1234.56, { ...numberOptions }, 'en')).toBe(expectedNumber);
  }
  expect(dates).toHaveBeenCalledTimes(1);
  expect(numbers).toHaveBeenCalledTimes(1);
});

it('respects changed options, locales, invalid inputs and inherited options', () => {
  const options = { maximumFractionDigits: 1 };
  expect(formatNumber(1.234, options, 'en')).toBe('1.2');
  options.maximumFractionDigits = 2;
  expect(formatNumber(1.234, options, 'en')).toBe('1.23');
  expect(formatNumber(1.234, options, 'ru')).toBe('1,23');
  const inherited: Intl.NumberFormatOptions = Object.create({ maximumFractionDigits: 0 });
  expect(formatNumber(1.9, inherited, 'en')).toBe('2');
  expect(() => formatNumber(1, { maximumFractionDigits: -1 })).toThrow(RangeError);
  expect(() => formatDateTime(NaN)).toThrow(RangeError);
  expect(formatDateTime(0, { timeZone: 'UTC', hour: '2-digit' }, 'en')).toBe(
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: '2-digit' }).format(0)
  );
});
