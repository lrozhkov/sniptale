import type { createLogger } from '@sniptale/platform/observability/logger';
import type { HoverController } from '../highlighter-hover-preview';
import type { HighlighterRuntimeState } from './state';

export type { HoverController };
export type HighlighterLogger = Pick<ReturnType<typeof createLogger>, 'log' | 'warn'>;

export interface HighlighterControllerDeps {
  createHoverController?: (
    getCallbacks: () => {
      addFrame: ((element: HTMLElement) => void) | null;
      addFreeFrame: import('../../../features/highlighter/contracts').AddFreeFrameCallback | null;
      hasFrameForElement: ((element: HTMLElement) => boolean) | null;
    },
    getState: {
      isModeEnabled: () => boolean;
      isPaused: () => boolean;
      isFrameEditing: () => boolean;
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
  consumeSuppressedClick: (event: MouseEvent) => boolean;
  disableMode: () => void;
  dispose: () => void;
  enableMode: () => void;
  invalidateFrameCache: () => void;
  isEnabled: () => boolean;
  isFrameEditing: () => boolean;
  isPausedState: () => boolean;
  pause: () => void;
  registerFrameCallbacks: (
    addFrame: (element: HTMLElement) => void,
    addFreeFrame: import('../../../features/highlighter/contracts').AddFreeFrameCallback,
    removeFrame: (frameId: string) => void,
    clearFrames: () => void,
    hasFrameForElement?: (element: HTMLElement) => boolean
  ) => void;
  removeHighlight: (id: string) => void;
  resume: () => void;
  setFrameEditing: () => void;
}
