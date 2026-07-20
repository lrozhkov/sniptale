import type { EffectMode } from '../../../../features/highlighter/contracts';

export interface FrameUIState {
  activeFrameId: string | null;
  popoverFrameId: string | null;
  effectModeCache: Record<string, EffectMode>;
  showTooltip: (frameId: string) => void;
  hideTooltip: (frameId: string) => void;
  forceHideTooltip: () => void;
  openPopover: (frameId: string) => void;
  closePopover: () => void;
  updateEffectModeCache: (frameId: string, mode: EffectMode) => void;
  getEffectMode: (frameId: string) => EffectMode;
  reset: () => void;
  isUIActive: () => boolean;
  isPopoverOpenFor: (frameId: string) => boolean;
  isTooltipVisibleFor: (frameId: string) => boolean;
}
