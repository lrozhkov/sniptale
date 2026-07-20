import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/public';
import { DEFAULT_EDITOR_TOOL_SETTINGS } from './tool-defaults';

describe('arrow tool defaults', () => {
  it('keeps head size controls at the canonical baseline', () => {
    const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

    expect(settings.arrow).toMatchObject({
      endHeadSize: 1,
      startHeadSize: 1,
    });
    expect(settings.pencil.dynamicWidth).toBe(true);
    expect(settings.highlighter.dynamicWidth).toBe(false);
  });

  it('keeps image shadow fallbacks when projected shape settings omit optional geometry', async () => {
    vi.resetModules();
    vi.doMock('./highlighter-projection', async () => ({
      ...(await vi.importActual<typeof import('./highlighter-projection')>(
        './highlighter-projection'
      )),
      projectBorderPresetToEditorShapeSettings: () => ({
        borderPresetId: 'preset-1',
        radius: 8,
        shadow: 20,
        strokeColor: '#123456',
        strokeOpacity: 0.5,
        strokeStyle: 'dash',
        strokeWidth: 2,
      }),
    }));

    const { DEFAULT_EDITOR_TOOL_SETTINGS: createSettings } = await import('./tool-defaults');

    expect(createSettings(DEFAULT_BORDER_PRESET).image).toMatchObject({
      shadowAngle: 90,
      shadowBlur: 12,
      shadowDistance: 4,
    });
    vi.resetModules();
    vi.doUnmock('./highlighter-projection');
  });
});
