import { describe, expect, it } from 'vitest';

import { createPreset, createSettings, createStoredSettings } from './test-helpers';

describe('highlighter storage test helpers', () => {
  it('creates presets with numeric shadow intensity defaults and merges overrides', () => {
    expect(createPreset('preset-1')).toMatchObject({
      id: 'preset-1',
      shadow: 0,
      style: 'solid',
    });

    expect(createPreset('preset-2', { shadow: 30, opacity: 80 })).toMatchObject({
      id: 'preset-2',
      shadow: 30,
      opacity: 80,
    });
  });

  it('creates detached settings and stored payload fixtures', () => {
    const firstSettings = createSettings();
    const secondSettings = createSettings();
    const storedSettings = createStoredSettings();

    firstSettings.borderPresets[0]!.padding.top = 77;

    expect(secondSettings.borderPresets[0]).toMatchObject({
      id: 'preset-1',
      padding: { top: 3, left: 3, right: 3, bottom: 3 },
    });
    expect(storedSettings).toEqual({
      sniptale_highlighter_settings: expect.objectContaining({
        borderPresets: [
          expect.objectContaining({ id: 'preset-1', shadow: 0 }),
          expect.objectContaining({ id: 'preset-2', order: 1, shadow: 0 }),
        ],
        defaultBorderPresetId: 'preset-2',
      }),
    });
  });
});
