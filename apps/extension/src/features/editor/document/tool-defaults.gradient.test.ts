import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_EDITOR_TOOL_SETTINGS } from './constants';
import { DEFAULT_BORDER_PRESET } from '../../highlighter/style/public';

describe('editor tool gradient defaults', () => {
  it('keeps line gradient stops aligned with legacy from/to defaults', () => {
    const settings = DEFAULT_EDITOR_TOOL_SETTINGS(DEFAULT_BORDER_PRESET);

    expect(settings.line.gradientStops).toEqual([
      { color: settings.line.gradientFrom, offset: 0 },
      { color: settings.line.gradientTo, offset: 1 },
    ]);
    expect(settings.pencil.dynamicWidth).toBe(true);
    expect(settings.highlighter.dynamicWidth).toBe(false);
  });

  it('falls back image shadow geometry when projected shape settings omit it', async () => {
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

    expect(createSettings(DEFAULT_BORDER_PRESET).image).toEqual(
      expect.objectContaining({
        shadowAngle: 90,
        shadowBlur: 12,
        shadowDistance: 4,
      })
    );

    vi.resetModules();
    vi.doUnmock('./highlighter-projection');
  });
});
