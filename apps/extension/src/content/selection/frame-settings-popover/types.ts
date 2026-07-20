import type React from 'react';
import type {
  BorderPreset,
  BlurSettings,
  EffectMode,
  FocusSettings,
  HighlighterSettings,
} from '../../../features/highlighter/contracts';
import type { AppTheme } from '../../../ui/theme';

interface FrameSettingsPopoverApplySettings {
  borderSettings?: BorderPreset;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
}

interface FrameSettingsPopoverSettingHandlers {
  handleBlurChange: (amount: number) => void;
  handleBlurShowBorderChange: (showBorder: boolean) => void;
  handleBlurTypeChange: (blurType: BlurSettings['blurType']) => void;
  handleFocusChange: (opacity: number) => void;
  handleFocusShowBorderChange: (showBorder: boolean) => void;
  handleSelectPreset: (preset: BorderPreset) => Promise<void>;
}

interface FrameSettingsPopoverLocalSettings {
  localBlurSettings: BlurSettings;
  localFocusSettings: FocusSettings;
  selectedPresetId: string;
}

export interface FrameSettingsPopoverBodyProps {
  anchorEl: HTMLElement | null;
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  effectMode: EffectMode;
  focusSettings?: FocusSettings;
  frameId: string;
  isOpen: boolean;
  onApplyToFrame: (settings: FrameSettingsPopoverApplySettings) => void;
  onClose: () => void;
}

export interface FrameSettingsPopoverSurfaceContentProps
  extends FrameSettingsPopoverSettingHandlers, FrameSettingsPopoverLocalSettings {
  effectMode: EffectMode;
  globalSettings: HighlighterSettings;
}

export interface FrameSettingsPopoverStateResult
  extends FrameSettingsPopoverSettingHandlers, FrameSettingsPopoverLocalSettings {
  globalSettings: HighlighterSettings;
}

export interface FrameSettingsPopoverSurfaceShellProps extends FrameSettingsPopoverSurfaceContentProps {
  dataFrameId: string;
  getPopoverStyle: () => React.CSSProperties;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  portalTheme: AppTheme | null;
}

export interface FrameSettingsPopoverSurfaceProps extends FrameSettingsPopoverSurfaceContentProps {
  anchorEl: HTMLElement | null;
  frameId: string;
  getPopoverStyle: () => React.CSSProperties;
  popoverRef: React.RefObject<HTMLDivElement | null>;
  portalTheme: AppTheme | null;
}
