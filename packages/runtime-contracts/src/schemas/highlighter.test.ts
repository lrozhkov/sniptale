import { describe, expect, it } from 'vitest';

import { BlurSettingsSchema, BorderPresetSchema } from './highlighter';

describe('highlighter schemas', () => {
  registerBorderPresetSchemaTests();
  registerBlurSchemaTests();
});

function registerBorderPresetSchemaTests() {
  it('accepts the expanded border preset visual contract', () => {
    expect(
      BorderPresetSchema.parse({
        id: 'preset',
        name: 'Preset',
        order: 0,
        width: 4,
        color: '#112233',
        style: 'solid',
        radius: 8,
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
        shadow: 30,
        opacity: 70,
        strokeOpacity: 50,
        fillColor: '#44556688',
        fillOpacity: 25,
        inheritCustomCss: true,
        customCss: 'outline: 1px solid red;',
        enabled: false,
        origin: 'system',
        systemPresetKey: 'system-review',
        basedOnRevision: 1,
        customized: true,
        effects: {
          blur: { amount: 10, blurType: 'gaussian' },
          focus: { blurAmount: 2, opacity: 0.5 },
          capture: { hideFrame: false },
          linkedTemplates: {
            calloutPresetId: 'system-callout-card',
            stepBadgePresetId: 'system-outline',
          },
        },
      })
    ).toEqual(
      expect.objectContaining({
        fillColor: '#44556688',
        fillOpacity: 25,
        strokeOpacity: 50,
        origin: 'system',
        systemPresetKey: 'system-review',
        effects: expect.objectContaining({
          linkedTemplates: {
            calloutPresetId: 'system-callout-card',
            stepBadgePresetId: 'system-outline',
          },
        }),
      })
    );
  });

  it('rejects arbitrary storage-owned system translation keys', () => {
    expect(() =>
      BorderPresetSchema.parse({
        id: 'system-unsafe',
        name: 'Unsafe',
        order: 0,
        width: 4,
        color: '#112233',
        style: 'solid',
        radius: 8,
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
        shadow: 0,
        opacity: 100,
        strokeOpacity: 100,
        fillColor: '#00000000',
        fillOpacity: 0,
        inheritCustomCss: false,
        customCss: '',
        origin: 'system',
        systemPresetKey: 'highlighter.systemPresets.injected',
      })
    ).toThrow();
  });
}

function registerBlurSchemaTests() {
  it('accepts pixelate blur settings through the blur schema', () => {
    expect(
      BlurSettingsSchema.parse({
        amount: 15,
        blurType: 'pixelate',
        borderPresetId: 'preset-1',
        radius: 8,
        shadow: 30,
        showBorder: true,
        strokeColor: '#112233',
        strokeOpacity: 0.6,
        strokeStyle: 'dash-dot',
        strokeWidth: 0,
      })
    ).toEqual({
      amount: 15,
      blurType: 'pixelate',
      borderPresetId: 'preset-1',
      radius: 8,
      shadow: 30,
      showBorder: true,
      strokeColor: '#112233',
      strokeOpacity: 0.6,
      strokeStyle: 'dash-dot',
      strokeWidth: 0,
    });
  });
}
