import { appendToContentOverlayRoot } from '../../platform/dom-host';

const VIDEO_CLICK_RIPPLE_STYLE_ID = 'video-ripple-styles';
const VIDEO_CLICK_RIPPLE_BACKGROUND =
  'color-mix(in srgb, var(--sniptale-color-accent) 40%, transparent)';

export interface VideoClicksDomDriverDeps {
  appendOverlayNode?: <T extends Node>(node: T) => T;
  scheduleTimeout?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  targetDocument?: Document;
  targetHead?: HTMLHeadElement;
}

interface VideoClicksDomDriver {
  showRipple: (x: number, y: number) => void;
}

function ensureRippleStyles(targetDocument: Document, targetHead: HTMLHeadElement): void {
  if (targetDocument.getElementById(VIDEO_CLICK_RIPPLE_STYLE_ID)) {
    return;
  }

  const style = targetDocument.createElement('style');
  style.id = VIDEO_CLICK_RIPPLE_STYLE_ID;
  style.textContent = `
    @keyframes video-ripple {
      0% {
        transform: scale(0);
        opacity: 1;
      }
      100% {
        transform: scale(2);
        opacity: 0;
      }
    }
  `;
  targetHead.appendChild(style);
}

function createRippleNode(targetDocument: Document, x: number, y: number): HTMLDivElement {
  const ripple = targetDocument.createElement('div');
  ripple.style.cssText = `
    position: fixed;
    left: ${x}px;
    top: ${y}px;
    width: 40px;
    height: 40px;
    margin-left: -20px;
    margin-top: -20px;
    border-radius: 50%;
    background: ${VIDEO_CLICK_RIPPLE_BACKGROUND};
    pointer-events: none;
    z-index: 2147483647;
    animation: video-ripple 400ms ease-out forwards;
  `;
  return ripple;
}

/**
 * Creates the DOM driver that owns ripple nodes, styles, and cleanup timers.
 */
export function createVideoClicksDomDriver(
  deps: VideoClicksDomDriverDeps = {}
): VideoClicksDomDriver {
  const targetDocument = deps.targetDocument ?? document;
  const targetHead = deps.targetHead ?? targetDocument.head;
  const appendOverlayNode = deps.appendOverlayNode ?? appendToContentOverlayRoot;
  const scheduleTimeout = deps.scheduleTimeout ?? globalThis.setTimeout.bind(globalThis);

  return {
    showRipple(x, y) {
      ensureRippleStyles(targetDocument, targetHead);
      const ripple = createRippleNode(targetDocument, x, y);
      appendOverlayNode(ripple);
      scheduleTimeout(() => {
        ripple.remove();
      }, 400);
    },
  };
}
