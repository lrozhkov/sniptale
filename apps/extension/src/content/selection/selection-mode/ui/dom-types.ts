import type { ContentSizeTooltipDom } from '@sniptale/ui/content-size-tooltip/dom';

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface SelectionModeDom {
  overlayContainer: HTMLElement | null;
  hoverFrame: HTMLElement | null;
  scissorsIcon: HTMLElement | null;
  hoverSizeLabel: HTMLElement | null;
  dragFrame: HTMLElement | null;
  finalFrame: HTMLElement | null;
  finalOverlay: HTMLElement | null;
  sizePanel: HTMLElement | null;
  sizeTooltip: ContentSizeTooltipDom | null;
  widthInput: HTMLInputElement | null;
  heightInput: HTMLInputElement | null;
  aspectRatioButton: HTMLButtonElement | null;
  cancelButton: HTMLButtonElement | null;
  dragEventCatcher: HTMLElement | null;
}
