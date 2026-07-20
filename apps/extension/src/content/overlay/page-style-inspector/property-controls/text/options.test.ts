import { expect, it } from 'vitest';
import { getFontFamilyOptions, getLetterSpacingOptions, getLineHeightOptions } from './options';

it('keeps custom computed text values available as current select options', () => {
  expect(getFontFamilyOptions('Custom Display')[0]).toEqual({
    label: 'Custom Display',
    value: 'Custom Display',
  });
  expect(getLineHeightOptions('1.37')[0]).toEqual({ label: '1.37', value: '1.37' });
  expect(getLetterSpacingOptions('0.25px')[0]).toEqual({
    label: '0.25px',
    value: '0.25px',
  });
});

it('does not duplicate built-in options with different casing', () => {
  expect(getFontFamilyOptions('arial, sans-serif')).toHaveLength(getFontFamilyOptions('').length);
});
