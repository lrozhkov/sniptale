import type { Group } from 'fabric';
import { useEditorStore } from '../../../state/useEditorStore';
import { createArrowObject } from '../../../objects/arrow';
import { parseColorForStore } from '../helpers';
import { extractLegacyArrowGeometry, isLegacyArrowPrimitive } from './geometry';

export function createLegacyArrowReplacement(legacyArrow: Group) {
  const fallbackSettings = useEditorStore.getState().toolSettings.arrow;
  const primitive = legacyArrow.getObjects().find(isLegacyArrowPrimitive);
  if (!primitive) {
    return null;
  }

  const settings = {
    ...fallbackSettings,
    color: parseColorForStore(primitive.stroke, fallbackSettings.color),
    width:
      typeof primitive.strokeWidth === 'number' ? primitive.strokeWidth : fallbackSettings.width,
    mode: legacyArrow.sniptaleArrowMode ?? fallbackSettings.mode,
    startHead: legacyArrow.sniptaleArrowStartHead ?? fallbackSettings.startHead,
    endHead: legacyArrow.sniptaleArrowEndHead ?? fallbackSettings.endHead,
  };

  const geometry = extractLegacyArrowGeometry(primitive, settings.mode);
  if (!geometry) {
    return null;
  }

  const replacement = createArrowObject({
    id: legacyArrow.sniptaleId ?? crypto.randomUUID(),
    labelIndex: 1,
    start: geometry.start,
    end: geometry.end,
    control: geometry.control,
    settings,
    ...(legacyArrow.sniptaleLabel === undefined ? {} : { label: legacyArrow.sniptaleLabel }),
  });

  replacement.visible = legacyArrow.visible;
  if (legacyArrow.sniptaleLocked !== undefined) {
    replacement.sniptaleLocked = legacyArrow.sniptaleLocked;
  }
  if (legacyArrow.sniptaleLabel !== undefined) {
    replacement.sniptaleLabel = legacyArrow.sniptaleLabel;
  }
  return replacement;
}
