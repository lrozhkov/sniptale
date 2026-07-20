import { describe, expect, it } from 'vitest';

import type { CompactCommand } from '../../../../compact';
import { buildTextAppearanceCommands } from './build';
import { createTextCommandParams, getTextAppearanceCommandControl } from './test-support';

describe('text appearance test support', () => {
  it('builds overridable text command params for owner-local command tests', () => {
    const params = createTextCommandParams({
      recentColors: ['#abcdef'],
      textCalloutFormatOptions: [{ value: 'bubble', label: 'Bubble' }],
    });

    expect(params.recentColors).toEqual(['#abcdef']);
    expect(params.textCalloutFormatOptions).toEqual([{ value: 'bubble', label: 'Bubble' }]);
    expect(params.inspectorToolSettings.text.backgroundOpacity).toBe(1);
    expect(params.toNumber('42', 7)).toBe(42);
    expect(params.toNumber('oops', 7)).toBe(7);
  });

  it('supports nested inspector text overrides and preview patch helpers', () => {
    const params = createTextCommandParams({
      inspectorToolSettings: {
        text: {
          backgroundOpacity: 0.4,
          backgroundColor: '#445566',
        },
      },
    });

    expect(params.inspectorToolSettings.text.backgroundOpacity).toBe(0.4);
    expect(params.inspectorToolSettings.text.backgroundColor).toBe('#445566');
    expect(params.previewTextPatch).toEqual(expect.any(Function));
  });

  it('extracts the child control props from compact command content', () => {
    const commands = buildTextAppearanceCommands(createTextCommandParams());
    const control = getTextAppearanceCommandControl(commands as CompactCommand[], 0);

    expect(control.props).toHaveProperty('value', '#222222');
    expect(control.props).toHaveProperty('onChange');
  });
});
