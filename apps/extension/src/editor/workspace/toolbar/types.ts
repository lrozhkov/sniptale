import type { EditorTool } from '../../../features/editor/document/types';
import type {
  EditorToolbarInspectorMeta,
  ToolbarInspector,
} from '../../inspector/toolbar-derived-state';

export type {
  EditorToolbarSelectionState,
  ToolbarInspector,
} from '../../inspector/toolbar-derived-state';

interface EditorToolbarHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditorToolbarContentProps {
  activeTool: EditorTool;
  gridEnabled: boolean;
  hasImage: boolean;
  history: EditorToolbarHistoryState;
  inspector: ToolbarInspector | 'tool';
  inspectorCollapsed: boolean;
  inspectorMeta: EditorToolbarInspectorMeta;
  isToolButtonActive: (tool: EditorTool) => boolean;
  isToolMode: boolean;
  viewportPreviewOpen: boolean;
  zoomPercent: number;
  onActivateTool: (tool: EditorTool) => void;
  onBeforeSelectionAwareAction: () => void;
  onCollapseInspector: () => void;
  onExpandInspector: () => void;
  onSetViewportPreviewOpenManually: (open: boolean) => void;
  onToggleInspector: (value: ToolbarInspector) => void;
}
