import { describe, expect, it } from 'vitest';
import { getCanonicalSystemCalloutPreset } from './callout-presets/catalog';
import { resolveCalloutColorBindings } from './callout-color-bindings';

describe('callout color bindings', () => {
  it('resolves connector, border, and background colors from the frame', () => {
    const style = getCanonicalSystemCalloutPreset('system-callout-bubble').style;
    const resolved = resolveCalloutColorBindings(
      {
        ...style,
        colorBindings: {
          accent: 'frame-border',
          connector: 'frame-border',
          surfaceBackground: 'frame-fill',
          surfaceBorder: 'frame-border',
        },
      },
      { borderColor: '#ff0000', fillColor: '#00ff00' }
    );

    expect(resolved.connector.color).toBe('#ff0000');
    expect(resolved.accentEdge.color).toBe('#ff0000');
    expect(resolved.surface.borderColor).toBe('#ff0000');
    expect(resolved.surface.backgroundColor).toBe('#00ff00');
  });

  it('falls back to the stored custom color when a frame source is unavailable', () => {
    const style = getCanonicalSystemCalloutPreset('system-callout-bubble').style;
    const resolved = resolveCalloutColorBindings(
      {
        ...style,
        colorBindings: { ...style.colorBindings, surfaceBackground: 'frame-fill' },
      },
      {}
    );

    expect(resolved.surface.backgroundColor).toBe(style.surface.backgroundColor);
  });
});
