import type { ContentToolbarDisplayMode } from '../../../../contracts/settings';
import type { ToolbarMenuState } from '../state/menu';
import type { ToolbarPageEditingMode } from '../types';
import type { ContentPrivilegedActionIntentSource } from '../../../application/privileged-action-intent';

export interface ToolbarModeButtonsProps {
  isCursorMode: boolean;
  aiPickMode: boolean;
  designReviewMode: boolean;
  drawingMode?: boolean;
  compactMenus?: boolean;
  displayMode?: ContentToolbarDisplayMode;
  sidebarVisible?: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
  highlighterMode: boolean;
  pendingMode?: 'ai' | 'cursor' | 'design-review' | 'drawing' | 'highlighter' | 'quick-edit' | null;
  toolbarMenuState: ToolbarMenuState;
  onEnableCursorMode?: () => void;
  onDisableAiPickMode?: () => void;
  onSelectPageEditingMode: (mode: ToolbarPageEditingMode) => void;
  onToggleDesignReview: () => void;
  onToggleDrawing?: () => void;
  onToggleQuickEdit: () => void;
  onToggleHighlighter: () => void;
  pinToTab?: boolean;
  pinToTabAvailable?: boolean;
  pinToTabLocked?: boolean;
  onPinToTabChange?: (
    value: boolean,
    contentIntentSource?: ContentPrivilegedActionIntentSource
  ) => void;
  onHide?: () => void;
  onClearPagePreparation?: () => void;
  canClearPagePreparation?: boolean;
}
