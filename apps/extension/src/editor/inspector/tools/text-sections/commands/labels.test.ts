import { describe, expect, it } from 'vitest';
import {
  resolveTextAlignLabel,
  resolveTextFontLabel,
  resolveTextVerticalAlignLabel,
} from './labels';

describe('text-command-labels', () => {
  it('uses known labels when options contain the selected text values', () => {
    const settings = {
      fontFamily: 'mono',
      textAlign: 'center',
      verticalAlign: 'bottom',
    } as never;

    expect(
      resolveTextFontLabel({ fontOptions: [{ value: 'mono', label: 'Mono' }] }, settings)
    ).toBe('Mono');
    expect(
      resolveTextAlignLabel({ textAlignOptions: [{ value: 'center', label: 'Center' }] }, settings)
    ).toBe('Center');
    expect(
      resolveTextVerticalAlignLabel(
        { textVerticalAlignOptions: [{ value: 'bottom', label: 'Bottom' }] },
        settings
      )
    ).toBe('Bottom');
  });

  it('falls back to raw values when options do not contain a match', () => {
    const settings = {
      fontFamily: 'custom-font',
      textAlign: 'right',
      verticalAlign: 'top',
    } as never;

    expect(resolveTextFontLabel({ fontOptions: [] }, settings)).toBe('custom-font');
    expect(resolveTextAlignLabel({ textAlignOptions: [] }, settings)).toBe('right');
    expect(resolveTextVerticalAlignLabel({ textVerticalAlignOptions: [] }, settings)).toBe('top');
  });

  it('treats missing align option catalogs as empty arrays', () => {
    const settings = {
      textAlign: 'left',
      verticalAlign: 'center',
    } as never;

    expect(resolveTextAlignLabel({ textAlignOptions: [] } as never, settings)).toBe('left');
    expect(resolveTextVerticalAlignLabel({ textVerticalAlignOptions: [] } as never, settings)).toBe(
      'center'
    );
  });
});
