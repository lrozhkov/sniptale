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
      })
    ).toEqual(
      expect.objectContaining({
        fillColor: '#44556688',
        fillOpacity: 25,
        strokeOpacity: 50,
      })
    );
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
