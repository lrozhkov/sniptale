import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
} from '../../../features/highlighter/contracts';

interface FrameSettingsPopoverApplySettings {
  borderSettings?: AppliedBorderSettings;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
}

export interface FrameSettingsPopoverProps {
  anchorEl: HTMLElement | null;
  blurSettings?: BlurSettings;
  borderSettings?: AppliedBorderSettings;
  compact?: boolean;
  effectMode: EffectMode;
  focusSettings?: FocusSettings;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  isOpen: boolean;
  onApplyToFrame: (settings: FrameSettingsPopoverApplySettings) => void;
  onClose: () => void;
  onEffectModeChange?: (mode: EffectMode) => void;
  scope?: 'frame' | 'session';
}
