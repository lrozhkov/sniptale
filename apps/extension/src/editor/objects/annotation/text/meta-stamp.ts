import type { Textbox } from 'fabric';
import type { EditorTextSettings } from '../../../../features/editor/document/types';
import {
  EDITOR_CANVAS_PANEL_SURFACE,
  EDITOR_CANVAS_TEXT_PRIMARY,
} from '../../../color/palette/constants';
import { createObjectLabel } from '../../../document/model';
import { applyTextboxCalloutSettings } from './settings';
import { createAnnotationTextbox } from './textbox';

function createDefaultMetaStampSettings(): EditorTextSettings {
  return {
    backgroundColor: EDITOR_CANVAS_PANEL_SURFACE,
    backgroundOpacity: 1,
    calloutFormat: 'panel',
    layoutMode: 'fixed-width',
    fontFamily: 'mono',
    fontSize: 14,
    fontStyle: 'normal',
    fontWeight: 'normal',
    linethrough: false,
    shadow: 0,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: EDITOR_CANVAS_TEXT_PRIMARY,
    shadowDistance: 4,
    tailSize: 0,
    textAlign: 'left',
    verticalAlign: 'top',
    textColor: EDITOR_CANVAS_TEXT_PRIMARY,
    textOpacity: 1,
    underline: false,
  };
}

export function createMetaStamp(
  kind: 'url' | 'date' | 'browser',
  value: string,
  left: number,
  top: number,
  index: number,
  settings?: EditorTextSettings
): Textbox {
  const textSettings = settings ?? createDefaultMetaStampSettings();
  const textbox = createAnnotationTextbox(value, left, top, textSettings);

  textbox.sniptaleId = crypto.randomUUID();
  textbox.sniptaleType = 'meta-stamp';
  textbox.sniptaleRole = 'stamp';
  textbox.sniptaleLabel = createObjectLabel('meta-stamp', index);
  textbox.sniptaleMetaKind = kind;
  applyTextboxCalloutSettings(textbox, textSettings);

  return textbox;
}
