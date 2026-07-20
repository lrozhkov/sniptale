import type { Textbox } from 'fabric';
import type { EditorTextSettings } from '../../../../features/editor/document/types';
import { applyTextCalloutRendering } from './callout/lifecycle';
import { DEFAULT_TEXT_CALLOUT_HEIGHT, DEFAULT_TEXT_CALLOUT_WIDTH } from './geometry';
import { applyTextLayout } from './layout/apply';
import { normalizeTextLayoutMode } from './mode';
import { DEFAULT_EDITOR_TEXTBOX_WIDTH } from './textbox';

export function applyTextboxCalloutSettings(textbox: Textbox, settings: EditorTextSettings): void {
  textbox.sniptaleTextCalloutFormat = settings.calloutFormat;
  const layoutMode = normalizeTextLayoutMode(settings.layoutMode);
  textbox.sniptaleTextLayoutMode = layoutMode;
  textbox.sniptaleTextVerticalAlign = settings.verticalAlign;
  textbox.sniptaleTextOpacity = settings.textOpacity ?? 1;
  textbox.sniptaleTextBackgroundOpacity = settings.backgroundOpacity ?? 1;
  textbox.sniptaleTextCalloutShadow = settings.shadow;
  textbox.sniptaleTextShadowAngle = settings.shadowAngle ?? 90;
  textbox.sniptaleTextShadowBlur = settings.shadowBlur ?? 12;
  textbox.sniptaleTextShadowColor = settings.shadowColor || settings.textColor;
  textbox.sniptaleTextShadowDistance = settings.shadowDistance ?? 4;
  if (settings.calloutFormat === 'plain') {
    textbox.sniptaleTextCalloutWidth = DEFAULT_EDITOR_TEXTBOX_WIDTH;
    delete textbox.sniptaleTextCalloutHeight;
  } else {
    textbox.sniptaleTextCalloutWidth = DEFAULT_TEXT_CALLOUT_WIDTH;
    textbox.sniptaleTextCalloutHeight = DEFAULT_TEXT_CALLOUT_HEIGHT;
  }
  applyTextLayout(textbox, {
    layoutMode,
    ...(layoutMode === 'fixed-width'
      ? {
          surfaceWidth:
            settings.calloutFormat === 'plain'
              ? DEFAULT_EDITOR_TEXTBOX_WIDTH
              : DEFAULT_TEXT_CALLOUT_WIDTH,
        }
      : {}),
  });
  applyTextCalloutRendering(textbox);
}
