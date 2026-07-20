import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ToolbarMenuState } from '../state/menu';

export interface ToolbarModeButtonsProps {
  isCursorMode: boolean;
  aiPickMode: boolean;
  compactMenus?: boolean;
  displayMode?: ContentToolbarDisplayMode;
  sidebarVisible?: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
  highlighterMode: boolean;
  pendingMode?: 'ai' | 'cursor' | 'highlighter' | 'quick-edit' | null;
  pageStyleInspectorOpen?: boolean;
  toolbarMenuState: ToolbarMenuState;
  onEnableCursorMode?: () => void;
  onDisableAiPickMode?: () => void;
  onAiPickContentStart: () => void;
  onTogglePageStyleInspector?: () => void;
  onToggleQuickEditDocumentMode: (enabled: boolean) => void;
  onToggleQuickEdit: () => void;
  onToggleHighlighter: () => void;
}
