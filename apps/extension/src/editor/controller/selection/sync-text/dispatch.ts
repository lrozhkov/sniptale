import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { isTextbox } from '../../core/helpers';
import { normalizeTextCalloutFormat } from '../../../objects/annotation/text/interaction';
import { normalizeTextLayoutMode } from '../../../objects/annotation/text/mode';
import { clamp } from '../../../document/model';
import { readTextSelectionAlignment } from './alignment';
import { readTextSelectionColors } from './colors';
import { readTextSelectionShadow } from './shadow';
import { readTextSelectionTypography } from './typography';

export function syncTextSelectionSettings(object: FabricObject): void {
  if (!isTextbox(object)) {
    return;
  }

  const store = useEditorStore.getState();
  const settings = store.selectionToolSettings.text;
  const calloutFormat = normalizeTextCalloutFormat(
    object.sniptaleTextCalloutFormat ?? settings.calloutFormat
  );
  const backgroundColorSource =
    calloutFormat === 'plain' ? object.textBackgroundColor : object.backgroundColor;
  const textOpacity =
    typeof object.sniptaleTextOpacity === 'number'
      ? clamp(object.sniptaleTextOpacity, 0, 1)
      : (settings.textOpacity ?? 1);
  const backgroundOpacity =
    typeof object.sniptaleTextBackgroundOpacity === 'number'
      ? clamp(object.sniptaleTextBackgroundOpacity, 0, 1)
      : settings.backgroundOpacity;

  store.updateSelectionTextSettings({
    calloutFormat,
    layoutMode: normalizeTextLayoutMode(object.sniptaleTextLayoutMode ?? settings.layoutMode),
    ...readTextSelectionAlignment(object),
    ...readTextSelectionColors(
      object,
      settings,
      textOpacity,
      backgroundOpacity,
      backgroundColorSource
    ),
    ...readTextSelectionShadow(object, settings),
    ...readTextSelectionTypography(object, settings),
  });
}
