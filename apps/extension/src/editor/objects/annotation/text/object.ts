import type { Textbox } from 'fabric';
import type { EditorTextSettings } from '../../../../features/editor/document/types';
import { translate } from '../../../../platform/i18n';
import { createObjectLabel } from '../../../document/model';
import { applyTextboxCalloutSettings } from './settings';
import { createAnnotationTextbox } from './textbox';

interface TextObjectOptions {
  id: string;
  initialInsertPending?: boolean;
  labelIndex: number;
  left: number;
  top: number;
  settings: EditorTextSettings;
  text?: string;
}

export function createTextObject(options: TextObjectOptions): Textbox {
  const { id, initialInsertPending = false, labelIndex, left, top, settings, text } = options;
  const textbox = createAnnotationTextbox(
    text ?? translate('editor.runtime.defaultTextboxText'),
    left,
    top,
    settings
  );

  textbox.sniptaleId = id;
  textbox.sniptaleType = 'text';
  textbox.sniptaleRole = 'annotation';
  textbox.sniptaleLabel = createObjectLabel('text', labelIndex);
  textbox.sniptaleTextInitialInsertPending = initialInsertPending;
  applyTextboxCalloutSettings(textbox, settings);

  return textbox;
}
