import { describe, expect, it } from 'vitest';

import type { BlurSettings } from '../../../features/highlighter/contracts';
import { parseStoredHighlighterSettings } from './guards';

function createBorderPreset(overrides: Record<string, unknown> = {}) {
  return {
    color: '#ff00aa',
    customCss: '',
    fillColor: '#00000000',
    fillOpacity: 0,
    id: 'preset-1',
    inheritCustomCss: false,
    name: 'Preset',
    opacity: 0.8,
    order: 0,
    padding: {
      bottom: 8,
      left: 8,
      right: 8,
      top: 8,
    },
    radius: 12,
    shadow: 30,
    strokeOpacity: 0.8,
    style: 'solid',
    width: 4,
    ...overrides,
  };
}

function createLegacyBorderPreset() {
  const preset: Record<string, unknown> = createBorderPreset();
  delete preset['fillColor'];
  delete preset['strokeOpacity'];
  delete preset['fillOpacity'];
  delete preset['inheritCustomCss'];
  return preset;
}

function expectValidBlurSettingsParse(
  defaultBlurSettings: BlurSettings,
  extraValue: Record<string, unknown> = {}
) {
  expect(
    parseStoredHighlighterSettings({
      ...extraValue,
      defaultBlurSettings,
    })
  ).toEqual({
    hasInvalidRoot: false,
    invalidFieldCount: 0,
    migratedLegacyBlurFormat: false,
    value: {
      ...(Object.keys(extraValue).length === 0 ? {} : extraValue),
      defaultBlurSettings,
    },
  });
}

describe('highlighter guards roots', () => {
  it('returns empty values for undefined and marks invalid non-record roots', () => {
    expect(parseStoredHighlighterSettings(undefined)).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: false,
      value: {},
    });

    expect(parseStoredHighlighterSettings('broken-root')).toEqual({
      hasInvalidRoot: true,
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: false,
      value: {},
    });
  });
});

describe('highlighter guards valid payloads', () => {
  it('parses a fully valid highlighter settings payload', () => {
    expectValidBlurSettingsParse(
      {
        amount: 20,
        blurType: 'solid',
        showBorder: true,
      },
      {
        borderPresets: [createBorderPreset()],
        defaultBorderPresetId: 'preset-1',
        defaultEffectMode: 'focus',
        defaultFocusSettings: {
          opacity: 0.6,
          showBorder: false,
        },
      }
    );
  });

  it('accepts pixelate as a valid blur type in stored blur defaults', () => {
    expectValidBlurSettingsParse({
      amount: 12,
      blurType: 'pixelate',
      showBorder: false,
    });
  });

  it('accepts rectangle-like blur border defaults from storage', () => {
    expectValidBlurSettingsParse({
      amount: 12,
      blurType: 'pixelate',
      borderPresetId: 'preset-1',
      radius: 8,
      shadow: 20,
      showBorder: true,
      strokeColor: '#112233',
      strokeOpacity: 0.6,
      strokeStyle: 'dash-dot',
      strokeWidth: 0,
    });
  });
});

describe('highlighter guards border preset visual fields', () => {
  it('normalizes legacy border presets to the expanded visual contract', () => {
    expect(
      parseStoredHighlighterSettings({
        borderPresets: [createLegacyBorderPreset()],
      }).value.borderPresets
    ).toEqual([
      {
        ...createBorderPreset(),
        fillColor: '#00000000',
        fillOpacity: 0,
        inheritCustomCss: false,
        strokeOpacity: 0.8,
      },
    ]);
  });

  it('keeps expanded border preset visual fields from storage', () => {
    const preset = createBorderPreset({
      customCss: 'outline: 2px solid #abcdef;',
      fillColor: '#123456',
      fillOpacity: 35,
      inheritCustomCss: true,
      strokeOpacity: 65,
    });

    expect(
      parseStoredHighlighterSettings({
        borderPresets: [preset],
      }).value.borderPresets
    ).toEqual([preset]);
  });
});

describe('highlighter guards minimal valid payloads', () => {
  it('keeps a standalone valid effect mode without other optional sections', () => {
    expect(
      parseStoredHighlighterSettings({
        defaultEffectMode: 'border',
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: false,
      value: {
        defaultEffectMode: 'border',
      },
    });
  });
});

describe('highlighter guards legacy blur migration', () => {
  it('migrates legacy blur settings that still use format without blurType', () => {
    expect(
      parseStoredHighlighterSettings({
        defaultBlurSettings: {
          amount: 24,
          format: 'legacy',
          showBorder: true,
        },
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 0,
      migratedLegacyBlurFormat: true,
      value: {
        defaultBlurSettings: {
          amount: 24,
          blurType: 'gaussian',
          showBorder: true,
        },
      },
    });
  });
});

describe('highlighter guards invalid fields', () => {
  it('keeps valid subfields while counting invalid entries across the payload', () => {
    expect(
      parseStoredHighlighterSettings({
        borderPresets: [createBorderPreset(), { id: 'broken' }],
        defaultBlurSettings: {
          amount: 'strong',
          blurType: 'distortion',
          radius: 'wide',
          showBorder: 'yes',
          strokeOpacity: 'opaque',
          strokeStyle: 'double',
        },
        defaultBorderPresetId: 7,
        defaultEffectMode: 'sparkle',
        defaultFocusSettings: {
          opacity: 0.75,
          showBorder: 'no',
        },
      })
    ).toEqual({
      hasInvalidRoot: false,
      invalidFieldCount: 9,
      migratedLegacyBlurFormat: false,
      value: {
        borderPresets: [createBorderPreset()],
        defaultBlurSettings: {
          blurType: 'distortion',
        },
        defaultFocusSettings: {
          opacity: 0.75,
        },
      },
    });
  });
});
