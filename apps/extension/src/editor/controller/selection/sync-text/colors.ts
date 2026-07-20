import type { Textbox } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { TRANSPARENT_COLOR } from '../../../document/model';
import { resolveZeroOpacityColor } from '../zero-opacity-color';

export function readTextSelectionColors(
  object: Textbox,
  settings: EditorToolSettings['text'],
  textOpacity: number,
  backgroundOpacity: number,
  backgroundColorSource: unknown
): Pick<
  EditorToolSettings['text'],
  'textColor' | 'textOpacity' | 'backgroundColor' | 'backgroundOpacity'
> {
  return {
    textColor: resolveZeroOpacityColor({
      fallback: settings.textColor,
      opacity: textOpacity,
      value: object.fill,
    }),
    textOpacity,
    backgroundColor: resolveZeroOpacityColor({
      fallback: TRANSPARENT_COLOR,
      opacity: backgroundOpacity,
      value: backgroundColorSource,
    }),
    backgroundOpacity,
  };
}
