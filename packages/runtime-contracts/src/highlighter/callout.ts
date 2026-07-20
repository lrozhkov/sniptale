import type { StepBadgeAnchor } from './step-badge';

export type CalloutAnchor = StepBadgeAnchor;
export type CalloutSide = 'top' | 'bottom' | 'left' | 'right' | 'auto';
export type CalloutVariant = 'bubble' | 'rect' | 'text-only';
export type CalloutFontFamily = 'sans' | 'serif' | 'mono';

export interface CalloutSettings {
  enabled: boolean;
  htmlContent: string;
  anchor: CalloutAnchor;
  side: CalloutSide;
  variant: CalloutVariant;
  bgColor: string;
  textColor: string;
  tailSize: number;
  fontFamily: CalloutFontFamily;
  fontWeight: 'normal' | 'bold';
  fontSize: number;
  maxWidth: number;
}
