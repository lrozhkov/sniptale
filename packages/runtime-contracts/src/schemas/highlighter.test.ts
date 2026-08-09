import { describe, expect, it } from 'vitest';
import { createGradientPaint } from '@sniptale/foundation/paint';

import { BlurSettingsSchema, BorderPresetSchema } from './highlighter';

describe('highlighter schemas', () => {
  registerBorderPresetSchemaTests();
  registerBlurSchemaTests();
});

function registerBorderPresetSchemaTests() {
  const gradient = createGradientPaint(
    '#44556688',
    (() => {
      let id = 0;
      return () => `schema-stop-${++id}`;
    })()
  );

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
        fillPaint: gradient,
        inheritCustomCss: true,
        customCss: 'outline: 1px solid red;',
        enabled: false,
        origin: 'system',
        systemPresetKey: 'system-review',
        basedOnRevision: 1,
        customized: true,
        tagIds: ['review'],
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
        fillPaint: gradient,
        origin: 'system',
        systemPresetKey: 'system-review',
        tagIds: ['review'],
        effects: expect.objectContaining({
          linkedTemplates: {
            calloutPresetId: 'system-callout-card',
            stepBadgePresetId: 'system-outline',
          },
        }),
      })
    );
  });

  it('migrates legacy fill fields but emits only canonical Paint', () => {
    const parsed = BorderPresetSchema.parse({
      id: 'legacy',
      name: 'Legacy',
      order: 0,
      width: 4,
      color: '#112233',
      style: 'solid',
      radius: 8,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      shadow: 0,
      fillColor: '#44556680',
      fillOpacity: 50,
      inheritCustomCss: false,
      customCss: '',
    });
    expect(parsed.fillPaint).toEqual({ kind: 'solid', color: '#44556640' });
    expect(parsed.tagIds).toEqual([]);
    expect(parsed).not.toHaveProperty('fillColor');
    expect(parsed).not.toHaveProperty('fillOpacity');
  });

  it('rejects duplicate or oversized annotation template tag references', () => {
    const base = {
      id: 'tagged',
      name: 'Tagged',
      order: 0,
      width: 4,
      color: '#112233',
      style: 'solid',
      radius: 8,
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      shadow: 0,
      fillPaint: { kind: 'solid', color: '#00000000' },
      inheritCustomCss: false,
      customCss: '',
    };

    expect(() => BorderPresetSchema.parse({ ...base, tagIds: ['same', 'same'] })).toThrow();
    expect(() =>
      BorderPresetSchema.parse({
        ...base,
        tagIds: Array.from({ length: 9 }, (_, index) => `tag-${index}`),
      })
    ).toThrow();
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
        fillPaint: { kind: 'solid', color: '#00000000' },
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
        strokeColor: '#11223399',
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
      strokeColor: '#11223399',
      strokeStyle: 'dash-dot',
      strokeWidth: 0,
    });
  });
}
