import { describe, expect, it } from 'vitest';

import {
  deriveNextEditorStepValueFromAnnotations,
  getNextEditorStepValue,
  normalizeEditorStepValue,
  resolveEditorStepSettingsPatch,
} from './value';

const baseSettings = {
  alphabet: 'latin',
  color: '#ff671d',
  opacity: 1,
  sizeLevel: 3,
  strokeColor: '#f8fafc',
  strokeOpacity: 1,
  strokeWidth: 2,
  textColor: '#ffffff',
  type: 'number',
  value: '1',
} as const;

function registerNormalizationTests() {
  it('normalizes numeric values to digits capped at two characters', () => {
    expect(normalizeEditorStepValue('a4-23', baseSettings)).toBe('42');
    expect(resolveEditorStepSettingsPatch(baseSettings, { value: 'x9y8z7' })).toEqual({
      value: '98',
    });
  });

  it('normalizes letters against the selected alphabet and applies safe defaults', () => {
    const latinSettings = { ...baseSettings, type: 'letter' as const, value: 'b' };
    const cyrillicSettings = { ...latinSettings, alphabet: 'cyrillic' as const, value: 'ж' };

    expect(normalizeEditorStepValue('b', latinSettings)).toBe('B');
    expect(normalizeEditorStepValue('Ж', cyrillicSettings)).toBe('Ж');
    expect(resolveEditorStepSettingsPatch(baseSettings, { type: 'letter' })).toEqual({
      type: 'letter',
      value: 'A',
    });
    expect(resolveEditorStepSettingsPatch(latinSettings, { alphabet: 'cyrillic' })).toEqual({
      alphabet: 'cyrillic',
      value: 'А',
    });
  });

  it('keeps manual values as arbitrary text capped at three characters', () => {
    const manualSettings = { ...baseSettings, type: 'manual' as const, value: '' };

    expect(normalizeEditorStepValue(' ok! ', manualSettings)).toBe('ok!');
    expect(resolveEditorStepSettingsPatch(baseSettings, { type: 'manual', value: '1234' })).toEqual(
      {
        type: 'manual',
        value: '123',
      }
    );
  });
}

function registerIncrementTests() {
  it('advances numeric and alphabetic values without leaving the allowed value domain', () => {
    expect(getNextEditorStepValue({ ...baseSettings, value: '98' })).toBe('99');
    expect(getNextEditorStepValue({ ...baseSettings, value: '99' })).toBe('99');
    expect(getNextEditorStepValue({ ...baseSettings, type: 'letter', value: 'A' })).toBe('B');
    expect(
      getNextEditorStepValue({
        ...baseSettings,
        alphabet: 'cyrillic',
        type: 'letter',
        value: 'Я',
      })
    ).toBe('А');
    expect(getNextEditorStepValue({ ...baseSettings, type: 'manual', value: 'QA' })).toBe('QA');
  });
}

function registerRestoreDerivationTests() {
  registerNumericRestoreDerivationTests();
  registerLetterRestoreDerivationTests();
  registerManualRestoreDerivationTests();
}

function registerNumericRestoreDerivationTests() {
  it('derives the next numeric value from restored step annotations', () => {
    expect(deriveNextEditorStepValueFromAnnotations(baseSettings, [])).toBe('1');
    expect(
      deriveNextEditorStepValueFromAnnotations(baseSettings, [
        { sniptaleStepType: 'number', sniptaleStepValue: '1', sniptaleType: 'step' },
        { sniptaleStepType: 'number', sniptaleStepValue: '2', sniptaleType: 'step' },
      ])
    ).toBe('3');
  });
}

function registerLetterRestoreDerivationTests() {
  it('derives latin and cyrillic letter values from matching restored annotations only', () => {
    const latinSettings = { ...baseSettings, alphabet: 'latin' as const, type: 'letter' as const };
    const cyrillicSettings = {
      ...baseSettings,
      alphabet: 'cyrillic' as const,
      type: 'letter' as const,
    };

    expect(
      deriveNextEditorStepValueFromAnnotations(latinSettings, [
        {
          sniptaleStepAlphabet: 'latin',
          sniptaleStepType: 'letter',
          sniptaleStepValue: 'A',
          sniptaleType: 'step',
        },
        {
          sniptaleStepAlphabet: 'latin',
          sniptaleStepType: 'letter',
          sniptaleStepValue: 'C',
          sniptaleType: 'step',
        },
        {
          sniptaleStepAlphabet: 'cyrillic',
          sniptaleStepType: 'letter',
          sniptaleStepValue: 'Ж',
          sniptaleType: 'step',
        },
        { sniptaleStepType: 'number', sniptaleStepValue: '7', sniptaleType: 'step' },
      ])
    ).toBe('D');
    expect(
      deriveNextEditorStepValueFromAnnotations(cyrillicSettings, [
        {
          sniptaleStepAlphabet: 'cyrillic',
          sniptaleStepType: 'letter',
          sniptaleStepValue: 'Б',
          sniptaleType: 'step',
        },
      ])
    ).toBe('В');
  });
}

function registerManualRestoreDerivationTests() {
  it('does not auto-advance restored manual values', () => {
    const manualSettings = { ...baseSettings, type: 'manual' as const };

    expect(deriveNextEditorStepValueFromAnnotations(manualSettings, [])).toBe('');
    expect(
      deriveNextEditorStepValueFromAnnotations(manualSettings, [
        { sniptaleStepType: 'manual', sniptaleStepValue: 'QA', sniptaleType: 'step' },
      ])
    ).toBe('QA');
  });
}

describe('editor step value helpers', () => {
  registerNormalizationTests();
  registerIncrementTests();
  registerRestoreDerivationTests();
});
