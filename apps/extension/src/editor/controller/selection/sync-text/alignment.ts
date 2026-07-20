import type { Textbox } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';

export function readTextSelectionAlignment(
  object: Textbox
): Pick<EditorToolSettings['text'], 'textAlign' | 'verticalAlign'> {
  return {
    textAlign:
      object.textAlign === 'center' || object.textAlign === 'right' ? object.textAlign : 'left',
    verticalAlign:
      object.sniptaleTextVerticalAlign === 'center' || object.sniptaleTextVerticalAlign === 'bottom'
        ? object.sniptaleTextVerticalAlign
        : 'top',
  };
}
