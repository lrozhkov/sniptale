import type { EditorRichShapeTextState } from '../../../features/editor/document/rich-shape';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';

function mapTextVerticalAlign(
  value: EditorToolSettings['text']['verticalAlign']
): EditorRichShapeTextState['verticalAlign'] {
  return value === 'center' ? 'middle' : value;
}

export function createCalloutText(
  baseText: EditorRichShapeTextState,
  settings: EditorToolSettings['callout']
): EditorRichShapeTextState {
  return {
    ...baseText,
    content: '',
    color: settings.text.textColor,
    fontFamily: settings.text.fontFamily,
    fontSize: settings.text.fontSize,
    fontStyle: settings.text.fontStyle,
    fontWeight: settings.text.fontWeight,
    horizontalAlign: settings.text.textAlign,
    verticalAlign: mapTextVerticalAlign(settings.text.verticalAlign),
    underline: settings.text.underline,
    strike: settings.text.linethrough,
  };
}
