import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { getAbsolutePosition } from '../../platform/frame';

const DESIGN_REVIEW_BORDER = '2px solid #000000';
let designReviewFrame: HTMLElement | null = null;

function ensureDesignReviewFrame(): HTMLElement {
  if (designReviewFrame?.isConnected) {
    return designReviewFrame;
  }

  const frame = document.createElement('div');
  frame.className = 'sniptale-design-review-frame';
  frame.style.cssText = `
    position: fixed;
    border: ${DESIGN_REVIEW_BORDER};
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border-radius: 0;
    pointer-events: none;
    display: none;
    z-index: 2147483645;
  `;

  appendToContentOverlayRoot(frame);
  designReviewFrame = frame;
  return frame;
}

function applyDesignReviewFrameRect(frame: HTMLElement, element: Element): void {
  const rect = getAbsolutePosition(element);
  frame.style.left = `${rect.x}px`;
  frame.style.top = `${rect.y}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
}

export function showDesignReviewFrame(element: Element): void {
  const frame = ensureDesignReviewFrame();
  applyDesignReviewFrameRect(frame, element);
  frame.style.display = 'block';
}

export function hideDesignReviewFrame(): void {
  if (designReviewFrame) {
    designReviewFrame.style.display = 'none';
  }
}

export function removeDesignReviewFrame(): void {
  designReviewFrame?.remove();
  designReviewFrame = null;
}
