import type {
  BorderPreset,
  BlurSettings,
  EffectMode,
  FocusSettings,
} from '../../../features/highlighter/contracts';

interface FrameSettingsPopoverApplySettings {
  borderSettings?: BorderPreset;
  blurSettings?: BlurSettings;
  focusSettings?: FocusSettings;
}

export interface FrameSettingsPopoverProps {
  anchorEl: HTMLElement | null;
  blurSettings?: BlurSettings;
  borderSettings?: BorderPreset;
  effectMode: EffectMode;
  focusSettings?: FocusSettings;
  frameId: string;
  frameRect: { x: number; y: number; width: number; height: number };
  isOpen: boolean;
  onApplyToFrame: (settings: FrameSettingsPopoverApplySettings) => void;
  onClose: () => void;
  scope?: 'frame' | 'session';
}
