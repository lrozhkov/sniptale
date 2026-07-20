/* eslint-disable max-lines-per-function --
   border preset projection proof intentionally keeps the contract cases together */
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_BORDER_PRESET } from '../../../features/highlighter/style/defaults';
import { createBorderPresetFromShapeSettings } from './border-preset';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),

  translate: (key: string) => key,
}));

describe('createBorderPresetFromShapeSettings', () => {
  it('creates a rectangle preset from the active shape settings and source padding', () => {
    const preset = createBorderPresetFromShapeSettings(
      {
        borderPresetId: 'preset-1',
        customCss: 'outline: 1px solid red;',
        fillColor: '#112233',
        fillOpacity: 0.25,
        inheritCustomCss: true,
        opacity: 0.4,
        radius: 7.8,
        shadow: 30,
        strokeColor: '#445566',
        strokeOpacity: 0.7,
        strokeStyle: 'dashed',
        strokeWidth: 5.6,
      } as never,
      [
        {
          ...DEFAULT_BORDER_PRESET,
          id: 'preset-1',
          name: 'Existing',
          order: 4,
          padding: { top: 6, right: 8, bottom: 10, left: 12 },
        },
      ]
    );

    expect(preset).toEqual(
      expect.objectContaining({
        color: '#445566',
        customCss: '',
        enabled: true,
        fillColor: '#112233',
        fillOpacity: 25,
        inheritCustomCss: false,
        name: 'editor.tools.rectangle 1',
        opacity: 70,
        order: 5,
        padding: { top: 6, right: 8, bottom: 10, left: 12 },
        radius: 8,
        shadow: 30,
        strokeOpacity: 70,
        style: 'dashed',
        width: 6,
      })
    );
  });

  it('falls back to the default padding and opacity-derived stroke values', () => {
    const preset = createBorderPresetFromShapeSettings(
      {
        borderPresetId: null,
        customCss: '',
        fillColor: '#abcdef',
        fillOpacity: undefined,
        inheritCustomCss: false,
        opacity: 0.62,
        radius: -1,
        shadow: 0,
        strokeColor: '#123456',
        strokeOpacity: undefined,
        strokeStyle: 'solid',
        strokeWidth: 0.4,
      } as never,
      [
        {
          ...DEFAULT_BORDER_PRESET,
          id: 'editor.tools.rectangle 1',
          name: 'editor.tools.rectangle 1',
        },
      ]
    );

    expect(preset).toEqual(
      expect.objectContaining({
        fillOpacity: 62,
        name: 'editor.tools.rectangle 2',
        padding: DEFAULT_BORDER_PRESET.padding,
        radius: 0,
        strokeOpacity: 62,
        width: 1,
      })
    );
  });
});
