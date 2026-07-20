export type HighlighterCallbacks = {
  addFrame: ((element: HTMLElement) => void) | null;
  hasFrameForElement: ((element: HTMLElement) => boolean) | null;
};

export type HighlighterStateGetters = {
  isModeEnabled: () => boolean;
  isPaused: () => boolean;
  isFrameEditing: () => boolean;
  isTooltipVisible: () => boolean;
};

export type HoverOverlayActions = {
  hideHoverOverlay: () => void;
  showHoverOverlay: (element: HTMLElement) => void;
};

export type HoverTrackingState = {
  hoverRafId: number | null;
  isHoverPreviewFrozen: boolean;
  lastHoverProcessTime: number;
  lastHoverTarget: HTMLElement | null;
  lastHoverX: number;
  lastHoverY: number;
};

export type HoverInteractionProps = {
  getCallbacks: () => HighlighterCallbacks;
  getState: HighlighterStateGetters;
  hoverState: ReturnType<typeof import('./helpers').createHighlighterHoverState>;
  hoverThrottleMs: number;
  overlayActions: HoverOverlayActions;
  trackingState: HoverTrackingState;
};
