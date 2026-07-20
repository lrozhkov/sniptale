import type {
  EditorLayerEffectCategory,
  EditorRasterEffect,
  EditorRasterEffectId,
} from '../../../features/editor/document/effects';

export type EditorLayerTransformationId =
  | 'flip-horizontal'
  | 'flip-vertical'
  | 'resize-layer'
  | 'rotate-left'
  | 'rotate-right';

export type EditorLayerEffectCommandId = EditorRasterEffectId | EditorLayerTransformationId;

interface EditorLayerEffectDefinition {
  category: EditorLayerEffectCategory;
  id: EditorLayerEffectCommandId;
  titleKey: `editor.layerEffects.${string}`;
}

const EDITOR_LAYER_EFFECT_DEFINITIONS: EditorLayerEffectDefinition[] = [
  { category: 'adjustments', id: 'brightness', titleKey: 'editor.layerEffects.brightness' },
  { category: 'adjustments', id: 'contrast', titleKey: 'editor.layerEffects.contrast' },
  { category: 'adjustments', id: 'gamma', titleKey: 'editor.layerEffects.gamma' },
  { category: 'adjustments', id: 'hue', titleKey: 'editor.layerEffects.hue' },
  { category: 'adjustments', id: 'saturation', titleKey: 'editor.layerEffects.saturation' },
  { category: 'adjustments', id: 'vibrance', titleKey: 'editor.layerEffects.vibrance' },
  { category: 'adjustments', id: 'invert', titleKey: 'editor.layerEffects.invert' },
  { category: 'adjustments', id: 'grayscale', titleKey: 'editor.layerEffects.grayscale' },
  { category: 'adjustments', id: 'sepia', titleKey: 'editor.layerEffects.sepia' },
  { category: 'adjustments', id: 'colorize', titleKey: 'editor.layerEffects.colorize' },
  {
    category: 'transformations',
    id: 'flip-horizontal',
    titleKey: 'editor.layerEffects.flipHorizontal',
  },
  {
    category: 'transformations',
    id: 'flip-vertical',
    titleKey: 'editor.layerEffects.flipVertical',
  },
  { category: 'transformations', id: 'rotate-left', titleKey: 'editor.layerEffects.rotateLeft' },
  { category: 'transformations', id: 'rotate-right', titleKey: 'editor.layerEffects.rotateRight' },
  { category: 'transformations', id: 'resize-layer', titleKey: 'editor.layerEffects.resizeLayer' },
  { category: 'filters', id: 'blur', titleKey: 'editor.layerEffects.blur' },
  { category: 'filters', id: 'noise', titleKey: 'editor.layerEffects.noise' },
  { category: 'filters', id: 'pixelate', titleKey: 'editor.layerEffects.pixelate' },
  { category: 'filters', id: 'sharpen', titleKey: 'editor.layerEffects.sharpen' },
  { category: 'filters', id: 'emboss', titleKey: 'editor.layerEffects.emboss' },
  { category: 'filters', id: 'edge-detect', titleKey: 'editor.layerEffects.edgeDetect' },
  { category: 'filters', id: 'black-white', titleKey: 'editor.layerEffects.blackWhite' },
  { category: 'filters', id: 'vintage', titleKey: 'editor.layerEffects.vintage' },
  { category: 'filters', id: 'brownie', titleKey: 'editor.layerEffects.brownie' },
  { category: 'filters', id: 'polaroid', titleKey: 'editor.layerEffects.polaroid' },
  { category: 'filters', id: 'kodachrome', titleKey: 'editor.layerEffects.kodachrome' },
  { category: 'filters', id: 'technicolor', titleKey: 'editor.layerEffects.technicolor' },
];

const EDITOR_LAYER_EFFECTS_BY_ID = new Map(
  EDITOR_LAYER_EFFECT_DEFINITIONS.map((definition) => [definition.id, definition])
);

function getEditorLayerEffectDefinition(
  id: EditorLayerEffectCommandId
): EditorLayerEffectDefinition | null {
  return EDITOR_LAYER_EFFECTS_BY_ID.get(id) ?? null;
}

export function getEditorLayerEffectDefinitionsByCategory(category: EditorLayerEffectCategory) {
  return EDITOR_LAYER_EFFECT_DEFINITIONS.filter((definition) => definition.category === category);
}

export function createDefaultEditorRasterEffect(id: EditorRasterEffectId): EditorRasterEffect {
  switch (id) {
    case 'brightness':
      return { id, enabled: true, amount: 0.18 };
    case 'contrast':
      return { id, enabled: true, amount: 0.18 };
    case 'gamma':
      return { id, enabled: true, red: 1.15, green: 1.15, blue: 1.15 };
    case 'hue':
      return { id, enabled: true, rotation: 0.15 };
    case 'saturation':
      return { id, enabled: true, amount: 0.2 };
    case 'vibrance':
      return { id, enabled: true, amount: 0.24 };
    case 'invert':
      return { id, enabled: true };
    case 'grayscale':
      return { id, enabled: true };
    case 'sepia':
      return { id, enabled: true };
    case 'colorize':
      return { id, enabled: true, color: '#ff7a1a', alpha: 0.26 };
    case 'blur':
      return { id, enabled: true, blur: 0.18 };
    case 'noise':
      return { id, enabled: true, noise: 120 };
    case 'pixelate':
      return { id, enabled: true, blocksize: 6 };
    case 'sharpen':
    case 'emboss':
    case 'edge-detect':
    case 'black-white':
    case 'vintage':
    case 'brownie':
    case 'polaroid':
    case 'kodachrome':
    case 'technicolor':
      return { id, enabled: true };
  }
}

export function isEditorRasterEffectId(id: EditorLayerEffectCommandId): id is EditorRasterEffectId {
  return getEditorLayerEffectDefinition(id)?.category !== 'transformations';
}

export function isEditorLayerTransformationId(
  id: EditorLayerEffectCommandId
): id is EditorLayerTransformationId {
  return getEditorLayerEffectDefinition(id)?.category === 'transformations';
}
