import { getAbsolutePosition } from '../../../../platform/frame';
import { appendToContentOverlayRoot } from '../../../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../../../platform/dom-host/isolated';

const AI_PICK_HOVER_COLOR = '#c084fc';

interface AiPickOverlayControllerDeps {
  addOverlayNode?: <T extends Node>(node: T) => T;
  applyRootStyle?: typeof applyIsolatedContentRootStyle;
}

type AiPickOverlayState = {
  hoverOverlay: HTMLElement | null;
  overlayContainer: HTMLElement | null;
};

export interface AiPickOverlayController {
  createHoverOverlay: () => void;
  createOverlayContainer: () => void;
  hideHoverOverlay: () => void;
  removeOverlayContainer: () => void;
  showHoverOverlay: (element: HTMLElement) => void;
}

function createAiPickOverlayState(): AiPickOverlayState {
  return {
    hoverOverlay: null,
    overlayContainer: null,
  };
}

function ensureOverlayContainer(
  state: AiPickOverlayState,
  deps: Required<Pick<AiPickOverlayControllerDeps, 'addOverlayNode' | 'applyRootStyle'>>
): HTMLElement {
  if (!state.overlayContainer) {
    state.overlayContainer = document.createElement('div');
    state.overlayContainer.className = 'sniptale-ai-pick-container';
    deps.applyRootStyle(
      state.overlayContainer,
      `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        width: auto;
        height: auto;
        pointer-events: none;
        z-index: 2147483645;
      `
    );
    deps.addOverlayNode(state.overlayContainer);
  }

  return state.overlayContainer;
}

function ensureHoverOverlay(
  state: AiPickOverlayState,
  deps: Required<Pick<AiPickOverlayControllerDeps, 'addOverlayNode' | 'applyRootStyle'>>
): HTMLElement {
  if (!state.hoverOverlay) {
    state.hoverOverlay = document.createElement('div');
    state.hoverOverlay.className = 'sniptale-ai-pick-hover';
    state.hoverOverlay.style.cssText = `
      position: absolute;
      border: 3px solid ${AI_PICK_HOVER_COLOR};
      border-radius: 0;
      background: transparent;
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      pointer-events: none;
      display: none;
      opacity: 0.62;
      z-index: 2147483645;
      box-shadow: 0 0 0 1px color-mix(in srgb, ${AI_PICK_HOVER_COLOR} 14%, transparent);
      transition:
        top 0.15s ease-out,
        left 0.15s ease-out,
        width 0.15s ease-out,
        height 0.15s ease-out,
        opacity 0.15s ease-out;
    `;
    ensureOverlayContainer(state, deps).appendChild(state.hoverOverlay);
  }

  return state.hoverOverlay;
}

export function createAiPickOverlayController(
  deps: AiPickOverlayControllerDeps = {}
): AiPickOverlayController {
  const runtimeDeps = {
    addOverlayNode: deps.addOverlayNode ?? appendToContentOverlayRoot,
    applyRootStyle: deps.applyRootStyle ?? applyIsolatedContentRootStyle,
  };
  const state = createAiPickOverlayState();

  return {
    createOverlayContainer: () => {
      ensureOverlayContainer(state, runtimeDeps);
    },

    createHoverOverlay: () => {
      ensureHoverOverlay(state, runtimeDeps);
    },

    showHoverOverlay: (element: HTMLElement) => {
      ensureOverlayContainer(state, runtimeDeps);
      const hover = ensureHoverOverlay(state, runtimeDeps);
      const pos = getAbsolutePosition(element);

      hover.style.top = `${pos.y}px`;
      hover.style.left = `${pos.x}px`;
      hover.style.width = `${pos.width}px`;
      hover.style.height = `${pos.height}px`;
      hover.style.display = 'block';
    },

    hideHoverOverlay: () => {
      state.hoverOverlay?.style.setProperty('display', 'none');
    },

    removeOverlayContainer: () => {
      state.overlayContainer?.remove();
      state.overlayContainer = null;
      state.hoverOverlay = null;
    },
  };
}
