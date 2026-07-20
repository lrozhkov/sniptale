import type { FabricObject } from 'fabric';
import {
  DEFAULT_EDITOR_IMAGE_SETTINGS,
  normalizeEditorImageSettings,
} from '../../../features/editor/document/constants';
import { useEditorStore } from '../../state/useEditorStore';
import { isImageLayerStyleObject, readImageSettingsFromObject } from '../../objects/image-style';
import { normalizeShadowPreset } from '../../objects/shadow';
import { resolveShapeStrokeColor } from './shape-fill';

export function syncImageSelectionSettings(object: FabricObject): void {
  if (!isImageLayerStyleObject(object)) {
    return;
  }

  const store = useEditorStore.getState();
  const defaultSettings = normalizeEditorImageSettings(DEFAULT_EDITOR_IMAGE_SETTINGS);
  const updateSelectionImageSettings = (
    store as {
      updateSelectionImageSettings?: (settings: typeof defaultSettings) => void;
    }
  ).updateSelectionImageSettings;
  if (!updateSelectionImageSettings) {
    return;
  }
  const strokeOpacity =
    typeof object.sniptaleImageStrokeOpacity === 'number'
      ? object.sniptaleImageStrokeOpacity
      : defaultSettings.strokeOpacity;
  const fallback = {
    ...defaultSettings,
    strokeColor:
      typeof object.sniptaleImageStrokeColor === 'string'
        ? object.sniptaleImageStrokeColor
        : resolveShapeStrokeColor(object.stroke, strokeOpacity, defaultSettings.strokeColor),
    strokeOpacity,
  };
  const settings = readImageSettingsFromObject(object, fallback);

  updateSelectionImageSettings({
    ...settings,
    shadow: normalizeShadowPreset(settings.shadow),
  });
}
