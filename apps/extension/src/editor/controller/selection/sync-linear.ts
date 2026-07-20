import type { FabricObject } from 'fabric';
import { useEditorStore } from '../../state/useEditorStore';
import { getArrowSettings, isArrowObject } from '../../objects/arrow';
import { getLineSettings, isLineObject } from '../../objects/line';

export function syncArrowSelectionSettings(object: FabricObject): void {
  if (!isArrowObject(object)) {
    return;
  }

  const store = useEditorStore.getState();
  const arrowSettings = getArrowSettings(object);
  store.updateSelectionArrowSettings({
    color: arrowSettings.color,
    width: arrowSettings.width,
    opacity: arrowSettings.opacity,
    shadow: arrowSettings.shadow,
    shadowAngle: arrowSettings.shadowAngle ?? 90,
    shadowBlur: arrowSettings.shadowBlur ?? 12,
    shadowColor: arrowSettings.shadowColor ?? arrowSettings.color,
    shadowDistance: arrowSettings.shadowDistance ?? 4,
    variant: arrowSettings.variant,
    mode: arrowSettings.mode,
    ...(arrowSettings.arrowType === undefined ? {} : { arrowType: arrowSettings.arrowType }),
    ...(arrowSettings.dynamicWidth === undefined
      ? {}
      : { dynamicWidth: arrowSettings.dynamicWidth }),
    startHead: arrowSettings.startHead,
    endHead: arrowSettings.endHead,
  });
}

export function syncLineSelectionSettings(object: FabricObject): void {
  if (!isLineObject(object)) {
    return;
  }

  useEditorStore.getState().updateSelectionLineSettings(getLineSettings(object));
}
