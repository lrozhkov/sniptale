import type { Textbox } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';

export function parseFontFamilyForStore(
  value: unknown,
  fallback: EditorToolSettings['text']['fontFamily']
): EditorToolSettings['text']['fontFamily'] {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.toLowerCase();
  if (normalized.includes('mono')) {
    return 'mono';
  }
  if (normalized.includes('georgia') || normalized.includes('serif')) {
    return 'serif';
  }
  return 'sans';
}

export function readTextSelectionTypography(
  object: Textbox,
  settings: EditorToolSettings['text']
): Pick<
  EditorToolSettings['text'],
  'fontFamily' | 'fontSize' | 'fontWeight' | 'fontStyle' | 'underline' | 'linethrough'
> {
  return {
    fontFamily: parseFontFamilyForStore(object.fontFamily, settings.fontFamily),
    fontSize: typeof object.fontSize === 'number' ? object.fontSize : settings.fontSize,
    fontWeight: (object.fontWeight as 'normal' | 'bold') ?? settings.fontWeight,
    fontStyle: (object.fontStyle as 'normal' | 'italic') ?? settings.fontStyle,
    underline: typeof object.underline === 'boolean' ? object.underline : settings.underline,
    linethrough:
      typeof object.linethrough === 'boolean' ? object.linethrough : settings.linethrough,
  };
}
