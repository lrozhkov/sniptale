import { describe, expect, it } from 'vitest';
import {
  createTextFabricShadow,
  getTextFillColor,
  getTextGlyphBackgroundColor,
} from './appearance';

function createTextSettings(overrides: Record<string, unknown> = {}) {
  return {
    backgroundColor: '#ffffff',
    backgroundOpacity: 0.4,
    calloutFormat: 'plain',
    shadow: 30,
    shadowAngle: 135,
    shadowColor: '#112233',
    textColor: '#445566',
    textOpacity: 0.5,
    ...overrides,
  } as never;
}

describe('text appearance helpers', () => {
  it('resolves glyph background and text fill opacity for plain text', () => {
    const settings = createTextSettings();

    expect(getTextGlyphBackgroundColor(settings)).toBe('rgba(255, 255, 255, 0.4)');
    expect(getTextFillColor(settings)).toBe('rgba(68, 85, 102, 0.5)');
  });

  it('skips glyph background and text shadow for legacy callout text', () => {
    const settings = createTextSettings({ calloutFormat: 'panel' });

    expect(getTextGlyphBackgroundColor(settings)).toBe('');
    expect(createTextFabricShadow(settings)).toBeUndefined();
  });

  it('creates text shadow with default opacity and angle fallbacks', () => {
    const settings = createTextSettings({
      backgroundOpacity: undefined,
      shadowAngle: undefined,
      shadowColor: undefined,
      textOpacity: undefined,
    });
    const shadow = createTextFabricShadow(settings);

    expect(getTextGlyphBackgroundColor(settings)).toBe('rgba(255, 255, 255, 1)');
    expect(getTextFillColor(settings)).toBe('rgba(68, 85, 102, 1)');
    expect(shadow).toMatchObject({ color: expect.stringContaining('68, 85, 102') });
  });
});
