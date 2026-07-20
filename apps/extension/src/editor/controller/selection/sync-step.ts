import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { isGroup, parseColorForStore } from '../core/helpers';

export function syncStepSelectionSettings(object: FabricObject): void {
  const store = useEditorStore.getState();
  const fallback = store.selectionToolSettings.step;
  store.updateSelectionStepSettings({
    value: object.sniptaleStepValue ?? fallback.value,
    type: object.sniptaleStepType ?? fallback.type,
    alphabet: object.sniptaleStepAlphabet ?? fallback.alphabet,
    sizeLevel: object.sniptaleStepSizeLevel ?? fallback.sizeLevel,
    opacity:
      typeof object.sniptaleStepOpacity === 'number'
        ? object.sniptaleStepOpacity
        : fallback.opacity,
    textColor: object.sniptaleStepTextColor ?? fallback.textColor,
    strokeColor: object.sniptaleStepStrokeColor ?? fallback.strokeColor,
    strokeOpacity:
      typeof object.sniptaleStepStrokeOpacity === 'number'
        ? object.sniptaleStepStrokeOpacity
        : fallback.strokeOpacity,
    strokeWidth:
      typeof object.sniptaleStepStrokeWidth === 'number'
        ? object.sniptaleStepStrokeWidth
        : fallback.strokeWidth,
  });

  if (!isGroup(object)) {
    return;
  }

  const [circle, text] = object.getObjects();
  if (!circle) {
    return;
  }

  store.updateSelectionStepSettings({
    color: object.sniptaleStepColor ?? parseColorForStore(circle.fill, fallback.color),
    textColor: object.sniptaleStepTextColor ?? parseColorForStore(text?.fill, fallback.textColor),
    strokeColor:
      object.sniptaleStepStrokeColor ?? parseColorForStore(circle.stroke, fallback.strokeColor),
    strokeWidth:
      typeof circle.strokeWidth === 'number'
        ? circle.strokeWidth
        : (object.sniptaleStepStrokeWidth ?? fallback.strokeWidth),
  });
}
