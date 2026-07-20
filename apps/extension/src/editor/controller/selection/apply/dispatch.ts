import type { FabricObject } from 'fabric';
import type { EditorObjectType } from '../../../../features/editor/document/types';
import type { EditorToolSettings } from '../../../../features/editor/document/tool-settings-types';
import { applyTextSelectionSettings } from '../apply-text';
import { applyStepSettings, applyBlurSettings } from './annotation';
import { applyBrushSettings } from './brush';
import { applyImageLayerSettings } from './image';
import { applyArrowSettings, applyLineSettings } from './line';
import { applyRichShapeSettings } from './rich-shape';
import { applyShapeSelectionSettings } from './shape';
import type { AdvancedSelectionType } from './types';

export function applySelectionToolSettingsToObjects(
  objects: FabricObject[],
  selectedType: EditorObjectType,
  selectionToolSettings: EditorToolSettings
): void {
  if (applyBasicSelectionSettings(objects, selectedType, selectionToolSettings)) {
    return;
  }

  applyAdvancedSelectionSettings(
    objects,
    selectedType as AdvancedSelectionType,
    selectionToolSettings
  );
}

function applyBasicSelectionSettings(
  objects: FabricObject[],
  selectedType: EditorObjectType,
  selectionToolSettings: EditorToolSettings
): boolean {
  switch (selectedType) {
    case 'transparent-base':
    case 'browser-frame':
      return true;
    case 'source-image':
    case 'image':
    case 'background': {
      applyImageLayerSettings(objects, selectionToolSettings.image);
      return true;
    }
    case 'pencil':
    case 'highlighter': {
      applyBrushSettings(objects, selectionToolSettings[selectedType]);
      return true;
    }
    case 'rectangle':
    case 'ellipse':
    case 'diamond': {
      applyShapeSelectionSettings(objects, selectedType, selectionToolSettings);
      return true;
    }
    case 'blur': {
      applyBlurSettings(objects, selectionToolSettings.blur);
      return true;
    }
    case 'arrow':
    case 'line':
    case 'text':
    case 'step':
    case 'rich-shape':
    case 'meta-stamp':
      return false;
  }
}

function applyAdvancedSelectionSettings(
  objects: FabricObject[],
  selectedType: AdvancedSelectionType,
  selectionToolSettings: EditorToolSettings
): void {
  switch (selectedType) {
    case 'text':
      applyTextSelectionSettings(objects, selectionToolSettings.text, { forcePlain: true });
      break;
    case 'meta-stamp': {
      applyTextSelectionSettings(objects, selectionToolSettings.text);
      break;
    }
    case 'step': {
      applyStepSettings(objects, selectionToolSettings.step);
      break;
    }
    case 'arrow': {
      applyArrowSettings(objects, selectionToolSettings.arrow);
      break;
    }
    case 'line': {
      applyLineSettings(objects, selectionToolSettings.line);
      break;
    }
    case 'rich-shape': {
      applyRichShapeSettings(objects, selectionToolSettings);
      break;
    }
  }
}
