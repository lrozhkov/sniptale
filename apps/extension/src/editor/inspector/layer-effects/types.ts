import type React from 'react';
import type {
  EditorLayerItem,
  EditorSelectionState,
} from '../../../features/editor/document/types';
import type { EditorRasterEffect } from '../../../features/editor/document/effects';
import type { EditorLayerTransformationId } from '../../controller/layer-effects/registry';
import type { EditorLayerEffectsOpenHandler } from '../layers/types';
import type { EditorInspectorLayerEffectsState } from './shared';

export interface EditorInspectorLayerEffectActions {
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
  applyLayerEffect: (layerId: string, effect: EditorRasterEffect) => Promise<void> | void;
  updateLayerEffect: (layerId: string, effect: EditorRasterEffect) => Promise<void> | void;
  previewLayerEffect: (layerId: string, effect: EditorRasterEffect) => void;
  resetLayerEffectPreview: (layerId: string) => void;
  removeLayerEffect: (layerId: string, effectId: EditorRasterEffect['id']) => void;
  applyLayerTransformation: (
    layerId: string,
    transformationId: EditorLayerTransformationId
  ) => Promise<void> | void;
}

export interface EditorInspectorLayerEffectSizeControls {
  layerSizeText: string;
  layerSizeDraft: { width: number; height: number };
  layerSizeLocked: boolean;
  layerAspectRatio: number | null;
  setLayerSizeDraft: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  setLayerSizeLocked: React.Dispatch<React.SetStateAction<boolean>>;
  updateLockedDraft: (
    state: { width: number; height: number },
    field: 'width' | 'height',
    value: number,
    locked: boolean,
    aspectRatio: number | null
  ) => { width: number; height: number };
  onResizeLayer: (layerId: string, width: number, height: number) => Promise<void> | void;
}

export interface EditorInspectorLayerEffectsProps
  extends EditorInspectorLayerEffectActions, EditorInspectorLayerEffectSizeControls {
  layers: EditorLayerItem[];
  selection: EditorSelectionState;
  layerEffectsState: EditorInspectorLayerEffectsState;
  setLayerEffectsState: React.Dispatch<React.SetStateAction<EditorInspectorLayerEffectsState>>;
}
