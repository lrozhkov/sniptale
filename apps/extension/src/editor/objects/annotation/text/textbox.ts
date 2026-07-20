import { Textbox } from 'fabric';
import type { EditorTextSettings } from '../../../../features/editor/document/types';
import {
  EDITOR_CANVAS_ACCENT,
  EDITOR_CANVAS_CONTROL_SURFACE,
} from '../../../color/palette/constants';
import { fontFamilyToCss } from '../../../document/model';
import {
  createTextFabricShadow,
  getTextFillColor,
  getTextGlyphBackgroundColor,
} from './appearance';
import { getTextCalloutBackgroundColor, getTextCalloutPadding } from './callout/format';

export const DEFAULT_EDITOR_TEXTBOX_WIDTH = 280;

export function createAnnotationTextbox(
  text: string,
  left: number,
  top: number,
  settings: EditorTextSettings
): Textbox {
  const textAlign = settings.textAlign ?? 'left';

  return new Textbox(text, {
    left,
    top,
    width: DEFAULT_EDITOR_TEXTBOX_WIDTH,
    originX: 'left',
    originY: 'top',
    fill: getTextFillColor(settings),
    backgroundColor: getTextCalloutBackgroundColor(settings),
    textBackgroundColor: getTextGlyphBackgroundColor(settings),
    fontSize: settings.fontSize,
    fontFamily: fontFamilyToCss(settings.fontFamily),
    fontWeight: settings.fontWeight,
    fontStyle: settings.fontStyle,
    textAlign,
    underline: settings.underline,
    linethrough: settings.linethrough,
    lineHeight: 1.25,
    padding: getTextCalloutPadding(settings.calloutFormat),
    editable: true,
    shadow: createTextFabricShadow(settings) ?? null,
    borderColor: EDITOR_CANVAS_ACCENT,
    cornerColor: EDITOR_CANVAS_CONTROL_SURFACE,
    cornerStrokeColor: EDITOR_CANVAS_ACCENT,
    transparentCorners: false,
    lockScalingFlip: true,
    objectCaching: false,
  });
}
