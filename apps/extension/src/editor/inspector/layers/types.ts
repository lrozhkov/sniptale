import type React from 'react';
import type { EditorLayerEffectCategory } from '../../../features/editor/document/effects';
import type { EditorLayerItem } from '../../../features/editor/document/types';
import type { EditorLayerEffectCommandId } from '../../controller/layer-effects/registry';

interface EditorLayerEffectsOpenOptions {
  focusViewport?: boolean;
}

export type EditorLayerEffectsOpenHandler = (
  layerId: string,
  category: EditorLayerEffectCategory,
  activeEffectId?: EditorLayerEffectCommandId | null,
  options?: EditorLayerEffectsOpenOptions
) => void;

export interface EditorInspectorLayersPanelStateProps {
  expanded: boolean;
  draggedLayerId: string | null;
  dragOverLayerId: string | null;
  setExpanded?: React.Dispatch<React.SetStateAction<boolean>>;
  setDraggedLayerId?: React.Dispatch<React.SetStateAction<string | null>>;
  setDragOverLayerId?: React.Dispatch<React.SetStateAction<string | null>>;
}

export interface EditorInspectorLayersPanelProps extends EditorInspectorLayersPanelStateProps {
  fillContainer?: boolean;
  layers: EditorLayerItem[];
  maxExpandedHeightRatio?: number;
  onCollapsePanel?: () => void;
  selectedObjectCount: number;
  onOpenLayerEffects: EditorLayerEffectsOpenHandler;
}
