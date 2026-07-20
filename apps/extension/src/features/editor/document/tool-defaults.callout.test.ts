import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/public';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from './tool-defaults';

describe('editor callout tool defaults', () => {
  registerCalloutDefaultProjectionTests();
  registerCalloutFallbackTests();
});

function registerCalloutDefaultProjectionTests() {
  it('projects border and text defaults into dynamic callout creation settings', () => {
    const settings = DEFAULT_EDITOR_TOOL_SETTINGS({
      ...DEFAULT_BORDER_PRESET,
      color: '#2563eb',
      fillColor: '#16a34a',
      radius: 12,
      width: 6,
    }).callout;

    expect(settings).toEqual(
      expect.objectContaining({
        tailSide: 'top',
        style: expect.objectContaining({
          fillColor: '#16a34a',
          radius: 12,
          strokeColor: '#2563eb',
          strokeWidth: 6,
        }),
        text: expect.objectContaining({
          calloutFormat: 'plain',
          textColor: '#111827',
        }),
      })
    );
  });

  it('keeps callout defaults independent from rectangle and plain text settings', () => {
    const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

    expect(settings.callout.style).not.toBe(settings.rectangle);
    expect(settings.callout.text).not.toBe(settings.text);
    expect(settings.callout.style.radius).toBe(12);
    expect(settings.rectangle.radius).toBe(DEFAULT_BORDER_PRESET.radius);
    expect(settings.callout.text.verticalAlign).toBe('top');
    expect(settings.text.verticalAlign).toBe('top');
  });
}

function registerCalloutFallbackTests() {
  it('keeps image shadow fallback branches when projected shape settings omit geometry', async () => {
    vi.resetModules();
    vi.doMock('./highlighter-projection', async (importOriginal) => ({
      ...(await importOriginal<typeof import('./highlighter-projection')>()),
      projectBorderPresetToEditorShapeSettings: () => ({
        borderPresetId: 'mocked-callout-preset',
        customCss: '',
        fillColor: '#ffffff',
        fillOpacity: 0,
        inheritCustomCss: false,
        opacity: 1,
        radius: 4,
        shadow: 18,
        strokeColor: '#abcdef',
        strokeOpacity: 0.75,
        strokeStyle: 'solid',
        strokeWidth: 2,
      }),
    }));

    const { DEFAULT_EDITOR_TOOL_SETTINGS: createSettings } = await import('./tool-defaults');
    const settings = createSettings(DEFAULT_BORDER_PRESET);

    expect(settings.image).toEqual(
      expect.objectContaining({
        borderPresetId: 'mocked-callout-preset',
        shadowAngle: 90,
        shadowBlur: 12,
        shadowColor: '#abcdef',
        shadowDistance: 4,
      })
    );

    vi.resetModules();
    vi.doUnmock('./highlighter-projection');
  });
}
