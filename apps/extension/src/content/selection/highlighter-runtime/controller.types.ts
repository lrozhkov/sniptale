import type { createLogger } from '@sniptale/platform/observability/logger';
import type { createHighlighterHoverController } from '../highlighter-hover-preview';
import type { HighlighterRuntimeState } from './state';

export type HoverController = ReturnType<typeof createHighlighterHoverController>;
export type HighlighterLogger = Pick<ReturnType<typeof createLogger>, 'log' | 'warn'>;

export interface HighlighterControllerDeps {
  createHoverController?: (
    getCallbacks: () => {
      addFrame: ((element: HTMLElement) => void) | null;
      hasFrameForElement: ((element: HTMLElement) => boolean) | null;
    },
    getState: {
      isModeEnabled: () => boolean;
      isPaused: () => boolean;
      isFrameEditing: () => boolean;
      isTooltipVisible: () => boolean;
    }
  ) => HoverController;
  createState?: () => HighlighterRuntimeState;
  disableRuntime?: (state: HighlighterRuntimeState, hoverController: HoverController) => void;
  enableRuntime?: (state: HighlighterRuntimeState, hoverController: HoverController) => void;
  logAccessibleIframeCount?: () => void;
  logger?: HighlighterLogger;
}

export interface HighlighterController {
  addHighlight: (element: HTMLElement) => void;
  clearAllHighlights: () => void;
  clearFrameEditing: () => void;
  clearFrameTooltipVisible: () => void;
  disableMode: () => void;
  dispose: () => void;
  enableMode: () => void;
  invalidateFrameCache: () => void;
  invalidateSettingsCache: () => void;
  isEnabled: () => boolean;
  isFrameTooltipVisible: () => boolean;
  isPausedState: () => boolean;
  pause: () => void;
  registerFrameCallbacks: (
    addFrame: (element: HTMLElement) => void,
    removeFrame: (frameId: string) => void,
    clearFrames: () => void,
    hasFrameForElement?: (element: HTMLElement) => boolean
  ) => void;
  removeHighlight: (id: string) => void;
  resume: () => void;
  setFrameEditing: () => void;
  setFrameTooltipVisible: () => void;
}
