import type { EditorLayerEffectCategory } from '../../features/editor/document/effects';
import type { EditorObjectType, EditorTool } from '../../features/editor/document/types';
import { mapObjectTypeToTool } from '../chrome/tool-icons';
import type { EditorInspector } from '../state/types';
import { getEditorInspectorMeta } from './meta';

export type ToolbarInspector = Exclude<EditorInspector, 'tool'>;

export interface EditorToolbarSelectionState {
  hasSelection: boolean;
  selectedObjectCount: number;
  selectedObjectId?: string | null;
  selectedObjectLabel?: string | null;
  selectedObjectLocked?: boolean;
  selectedObjectType?: string | null;
}

export interface EditorToolbarInspectorMeta {
  subtitle: string;
  title: string;
}

export function getEditorToolbarDerivedState(args: {
  activeTool: EditorTool;
  inspector: ToolbarInspector | 'tool';
  layerEffectsCategory?: EditorLayerEffectCategory;
  selection: EditorToolbarSelectionState;
}) {
  const isToolMode = args.inspector === 'tool';
  const isSelectionInspector =
    args.activeTool === 'select' &&
    args.selection.hasSelection &&
    Boolean(args.selection.selectedObjectType);
  const selectedObjectType = (args.selection.selectedObjectType ?? null) as EditorObjectType | null;

  return {
    highlightedTool: isSelectionInspector
      ? mapObjectTypeToTool(selectedObjectType)
      : args.activeTool,
    inspectorMeta: ((meta) => ({
      subtitle: meta.subtitle,
      title: meta.title,
    }))(
      getEditorInspectorMeta({
        inspector: args.inspector,
        activeTool: args.activeTool,
        isSelectionInspector,
        selectedObjectLabel: args.selection.selectedObjectLabel ?? null,
        selectedObjectType,
        ...(args.layerEffectsCategory === undefined
          ? {}
          : { layerEffectsCategory: args.layerEffectsCategory }),
      })
    ) as EditorToolbarInspectorMeta,
    isToolButtonActive: (tool: EditorTool) => args.inspector !== 'file' && args.activeTool === tool,
    isToolMode,
  };
}
