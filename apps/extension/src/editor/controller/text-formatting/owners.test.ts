import { describe, expect, it } from 'vitest';
import {
  getObjectStylePatch,
  getSelectionStylePatch,
  getTextSettingsStylePatch,
} from './style-patch';

describe('editor text formatting role owners', () => {
  it('keeps object, selection, and settings patch calculations in the style-patch owner', () => {
    const textbox = {
      fontWeight: 'bold',
      getSelectionStyles: () => [{ underline: true }, { underline: true }],
      underline: false,
    };

    expect(getObjectStylePatch(textbox as never, 'bold')).toEqual({ fontWeight: 'normal' });
    expect(getObjectStylePatch(textbox as never, 'underline')).toEqual({ underline: true });
    expect(getSelectionStylePatch(textbox as never, 'underline', 0, 2)).toEqual({
      underline: false,
    });
    expect(
      getTextSettingsStylePatch(
        {
          fontStyle: 'italic',
          fontWeight: 'normal',
          linethrough: false,
          underline: false,
        } as never,
        'italic'
      )
    ).toEqual({ fontStyle: 'normal' });
  });
});
