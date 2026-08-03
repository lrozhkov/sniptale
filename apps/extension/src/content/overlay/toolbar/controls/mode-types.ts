import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ToolbarMenuState } from '../state/menu';
import type { ToolbarPageEditingMode } from '../types';

export interface ToolbarModeButtonsProps {
  isCursorMode: boolean;
  aiPickMode: boolean;
  designReviewMode: boolean;
  compactMenus?: boolean;
  displayMode?: ContentToolbarDisplayMode;
  sidebarVisible?: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
  highlighterMode: boolean;
  pendingMode?: 'ai' | 'cursor' | 'design-review' | 'highlighter' | 'quick-edit' | null;
  toolbarMenuState: ToolbarMenuState;
  onEnableCursorMode?: () => void;
  onDisableAiPickMode?: () => void;
  onSelectPageEditingMode: (mode: ToolbarPageEditingMode) => void;
  onToggleDesignReview: () => void;
  onToggleQuickEdit: () => void;
  onToggleHighlighter: () => void;
}
