// Highlighter Types
import type {
  BlurSettings,
  BorderPreset,
  EffectMode,
  FocusSettings,
} from '@sniptale/ui/highlighter-style/types';
export type {
  BlurSettings,
  BlurStrokeStyle,
  BlurType,
  BorderPadding,
  BorderPreset,
  EffectMode,
  FocusSettings,
} from '@sniptale/ui/highlighter-style/types';

export interface HighlightRect {
  id: string;
  element: HTMLElement;
  overlay: HTMLElement;
  originalRect: DOMRect;
}

export interface HighlighterState {
  enabled: boolean;
  highlights: Map<string, HighlightRect>;
}

// ========================================
// Step Badge Types (нумерация/маркировка рамок)
// ========================================

export * from '@sniptale/runtime-contracts/highlighter/step-badge';
export * from '@sniptale/runtime-contracts/highlighter/callout';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';

// Настройки режима выделения
export interface HighlighterSettings {
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
  defaultEffectMode: EffectMode;
  defaultBlurSettings: BlurSettings;
  defaultFocusSettings: FocusSettings;
}

export interface FrameData {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  linkedElementSelector?: string;
  createdBy?: 'auto-blur';
  linkedElement?: HTMLElement; // Ссылка на элемент для синхронизации при скролле
  effectMode?: EffectMode; // Эффект выделения: 'border' (default), 'blur' или 'focus'
  // Снимок настроек на момент создания рамки (чтобы не менялись при смене глобальных настроек)
  borderSettings?: BorderPreset;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
  // Настройки бейджа шага (нумерация/маркировка)
  stepBadge?: StepBadgeSettings;
  // Настройки callout (комментария)
  callout?: CalloutSettings;
  // Смещение относительно linkedElement после ручного редактирования
  // Если задано - рамка следует за элементом с учетом этого смещения
  offset?: {
    x: number; // смещение по X: frame.x - elementRect.x
    y: number; // смещение по Y: frame.y - elementRect.y
    width: number; // разница ширин: frame.width - elementRect.width
    height: number; // разница высот: frame.height - elementRect.height
  };
}

export type FrameState = 'idle' | 'hover' | 'editing';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

// Quick Edit Types
export interface EditableElement {
  element: HTMLElement;
  originalText: string;
  originalInnerHTML: string; // Full HTML content for proper cancellation
  originalChildNodes?: Node[];
  originalContentEditable: string;
  originalClass?: string; // Original class attribute
  originalStyle?: string; // Original style attribute
  originalHref?: string;
}

export interface QuickEditState {
  enabled: boolean;
  editingElements: Map<string, EditableElement>;
}

// UI State
export interface UIState {
  screenshotMode: boolean;
  highlighterMode: boolean;
  quickEditMode: boolean;
  isAIModalOpen: boolean;
}
