import type { FabricObject } from 'fabric';
import type { EditorToolSettings } from '../../../features/editor/document/tool-settings-types';
import { isTextbox } from '../core/helpers';
import { applyTextLayout } from '../../objects/annotation/text/layout/apply';
import { applyTextCalloutRendering } from '../../objects/annotation/text/callout/lifecycle';
import {
  getTextCalloutBackgroundColor,
  getTextCalloutPadding,
} from '../../objects/annotation/text/callout/format';
import {
  getTextFillColor,
  getTextGlyphBackgroundColor,
} from '../../objects/annotation/text/appearance';
import { fontFamilyToCss } from '../../document/model';

export function applyTextSelectionSettings(
  objects: FabricObject[],
  textSettings: EditorToolSettings['text'],
  options: { forcePlain?: boolean } = {}
): void {
  const resolvedTextSettings = options.forcePlain
    ? ({ ...textSettings, calloutFormat: 'plain' } satisfies EditorToolSettings['text'])
    : textSettings;

  objects.forEach((object) => {
    if (!isTextbox(object)) {
      return;
    }

    object.set({
      fill: getTextFillColor(resolvedTextSettings),
      backgroundColor: getTextCalloutBackgroundColor(resolvedTextSettings),
      textBackgroundColor: getTextGlyphBackgroundColor(resolvedTextSettings),
      fontFamily: fontFamilyToCss(resolvedTextSettings.fontFamily),
      fontSize: resolvedTextSettings.fontSize,
      fontWeight: resolvedTextSettings.fontWeight,
      fontStyle: resolvedTextSettings.fontStyle,
      textAlign: resolvedTextSettings.textAlign,
      underline: resolvedTextSettings.underline,
      linethrough: resolvedTextSettings.linethrough,
      padding: getTextCalloutPadding(resolvedTextSettings.calloutFormat),
      shadow: undefined,
    });
    object.sniptaleTextCalloutFormat = resolvedTextSettings.calloutFormat;
    object.sniptaleTextLayoutMode = resolvedTextSettings.layoutMode;
    object.sniptaleTextVerticalAlign = resolvedTextSettings.verticalAlign;
    object.sniptaleTextOpacity = resolvedTextSettings.textOpacity ?? 1;
    object.sniptaleTextBackgroundOpacity = resolvedTextSettings.backgroundOpacity ?? 1;
    object.sniptaleTextCalloutShadow = resolvedTextSettings.shadow;
    object.sniptaleTextShadowAngle = resolvedTextSettings.shadowAngle ?? 90;
    object.sniptaleTextShadowBlur = resolvedTextSettings.shadowBlur ?? 12;
    object.sniptaleTextShadowColor =
      resolvedTextSettings.shadowColor || resolvedTextSettings.textColor;
    object.sniptaleTextShadowDistance = resolvedTextSettings.shadowDistance ?? 4;
    applyTextLayout(object, { layoutMode: resolvedTextSettings.layoutMode });
    applyTextCalloutRendering(object);
  });
}
