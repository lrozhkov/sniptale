import { describe, expect, it } from 'vitest';
import type { CalloutPreset } from '@sniptale/runtime-contracts/highlighter/callout';
import { getCalloutPresetDisplayName } from './display-name';

const preset = {
  id: 'bubble',
  name: 'Bubble',
  order: 0,
  origin: 'system',
  systemPresetKey: 'system-callout-bubble',
} as CalloutPreset;

describe('getCalloutPresetDisplayName', () => {
  it('localizes system names and preserves user names', () => {
    expect(getCalloutPresetDisplayName(preset, 'ru')).toBe('Облачко');
    expect(
      getCalloutPresetDisplayName(
        { ...preset, origin: 'user', systemPresetKey: undefined, name: 'Mine' },
        'en'
      )
    ).toBe('Mine');
  });
});
