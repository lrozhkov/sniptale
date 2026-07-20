import type { Textbox } from 'fabric';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { parseColorForStore } from '../../core/helpers';
import { normalizeShadowPreset } from '../../../objects/shadow';

function readTextShadowColor(object: Textbox, settings: EditorToolSettings['text']): string {
  return parseColorForStore(
    object.sniptaleTextShadowColor,
    settings.shadowColor ?? settings.textColor ?? '#111827'
  );
}

export function readTextSelectionShadow(object: Textbox, settings: EditorToolSettings['text']) {
  return {
    shadow: normalizeShadowPreset(object.sniptaleTextCalloutShadow),
    shadowAngle:
      typeof object.sniptaleTextShadowAngle === 'number'
        ? object.sniptaleTextShadowAngle
        : (settings.shadowAngle ?? 90),
    shadowBlur:
      typeof object.sniptaleTextShadowBlur === 'number'
        ? object.sniptaleTextShadowBlur
        : (settings.shadowBlur ?? 12),
    shadowColor: readTextShadowColor(object, settings),
    shadowDistance:
      typeof object.sniptaleTextShadowDistance === 'number'
        ? object.sniptaleTextShadowDistance
        : (settings.shadowDistance ?? 4),
  };
}
