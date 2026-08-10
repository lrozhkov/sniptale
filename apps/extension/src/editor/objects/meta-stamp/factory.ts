import { Textbox } from 'fabric';
import {
  resolveDrawingTextFontFamily,
  type DrawingToolDefaults,
} from '../../../features/drawing/public';
import {
  EDITOR_CANVAS_PANEL_SURFACE,
  EDITOR_CANVAS_TEXT_PRIMARY,
} from '../../color/palette/constants';
import { createObjectLabel } from '../../document/model';

function createDefaultMetaStampSettings(): DrawingToolDefaults['text'] {
  return {
    backgroundColor: EDITOR_CANVAS_PANEL_SURFACE,
    fontFamily: 'mono',
    fontSize: 14,
    color: EDITOR_CANVAS_TEXT_PRIMARY,
  };
}

export function createMetaStamp(
  kind: 'url' | 'date' | 'browser',
  value: string,
  left: number,
  top: number,
  index: number,
  settings?: DrawingToolDefaults['text']
): Textbox {
  const textSettings = settings ?? createDefaultMetaStampSettings();
  const textbox = new Textbox(value, {
    backgroundColor: textSettings.backgroundColor ?? '',
    fill: textSettings.color,
    fontFamily: resolveDrawingTextFontFamily(textSettings.fontFamily),
    fontSize: textSettings.fontSize,
    left,
    originX: 'left',
    originY: 'top',
    padding: 8,
    top,
    width: 360,
  });

  textbox.sniptaleId = crypto.randomUUID();
  textbox.sniptaleType = 'meta-stamp';
  textbox.sniptaleRole = 'stamp';
  textbox.sniptaleLabel = createObjectLabel('meta-stamp', index);
  textbox.sniptaleMetaKind = kind;
  return textbox;
}
