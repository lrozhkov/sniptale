import { describe, expect, it } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from '../../../features/editor/document/constants';
import { parseArrowSettings } from './setting-parsers';

const defaultArrowSettings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET).arrow;

describe('parseArrowSettings', () => {
  registerArrowVariantParserTests();
  registerArrowLegacyParserTests();
});

function registerArrowVariantParserTests() {
  it('accepts explicit tapered variants and falls back to standard when the variant is absent', () => {
    const standardFallbackSettings = {
      ...defaultArrowSettings,
      variant: 'standard' as const,
    };

    expect(
      parseArrowSettings({
        ...defaultArrowSettings,
        variant: 'tapered',
      })
    ).toEqual({
      ...defaultArrowSettings,
      variant: 'tapered',
    });
    expect(
      parseArrowSettings({
        ...defaultArrowSettings,
        variant: undefined,
      })
    ).toEqual(standardFallbackSettings);
  });
}

function registerArrowLegacyParserTests() {
  it('fills legacy arrow shadow metadata from the current color', () => {
    expect(
      parseArrowSettings({
        ...defaultArrowSettings,
        shadowAngle: undefined,
        shadowColor: undefined,
      })
    ).toEqual({
      ...defaultArrowSettings,
      shadowAngle: 90,
      shadowColor: defaultArrowSettings.color,
    });
  });

  it('normalizes legacy arrow head sizes', () => {
    expect(
      parseArrowSettings({
        ...defaultArrowSettings,
        startHeadSize: undefined,
        endHeadSize: 12,
      })
    ).toEqual({
      ...defaultArrowSettings,
      startHeadSize: 1,
      endHeadSize: 6,
    });
  });

  it('rejects malformed arrow head sizes', () => {
    expect(parseArrowSettings({ ...defaultArrowSettings, startHeadSize: 'large' })).toBeNull();
  });
}
