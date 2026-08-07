import type { ReactNode } from 'react';
import type { CalloutSettings } from '@sniptale/runtime-contracts/highlighter/callout';
import type { StepBadgeSettings } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type {
  AppliedBorderSettings,
  BlurSettings,
  EffectMode,
  FocusSettings,
} from '../../features/highlighter/contracts';

export interface FrameAnnotationStyleSettings {
  blurSettings: BlurSettings;
  borderSettings: AppliedBorderSettings;
  effectMode: EffectMode;
  focusSettings: FocusSettings;
}

export interface FrameAnnotationCreationSettings extends FrameAnnotationStyleSettings {
  callout: CalloutSettings | null;
  stepBadge: StepBadgeSettings | null;
}

export type FrameAnnotationCreationMenu = 'frame' | 'callout' | 'step-badge';

export interface FrameAnnotationCreationFramePopoverRenderArgs {
  anchorEl: HTMLButtonElement | null;
  isOpen: boolean;
  onChange: (settings: FrameAnnotationStyleSettings) => void;
  onClose: () => void;
  settings: FrameAnnotationStyleSettings;
}

export type FrameAnnotationCreationFramePopoverRenderer = (
  args: FrameAnnotationCreationFramePopoverRenderArgs
) => ReactNode;
