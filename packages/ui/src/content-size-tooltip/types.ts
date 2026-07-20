import type { ContentSizeTooltipCopy } from './core';

export interface ContentSizeTooltipProps {
  copy: ContentSizeTooltipCopy;
  heightMax: number;
  heightMin: number;
  heightValue: number;
  maintainAspectRatio: boolean;
  position: { x: number; y: number };
  canToggleAspectRatio?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onHeightChangeCommit: (value: number) => void;
  onHeightChangeRaw: (value: number) => void;
  onHeightDecrease: () => void;
  onHeightIncrease: () => void;
  onToggleAspectRatio: () => void;
  onWidthChangeCommit: (value: number) => void;
  onWidthChangeRaw: (value: number) => void;
  onWidthDecrease: () => void;
  onWidthIncrease: () => void;
  portalTheme?: 'light' | 'dark' | null;
  widthMax: number;
  widthMin: number;
  widthValue: number;
}
