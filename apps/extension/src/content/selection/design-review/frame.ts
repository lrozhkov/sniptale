import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { getAbsolutePosition } from '../../platform/frame';

const DESIGN_REVIEW_BORDER = '1px solid #000000';
const DESIGN_REVIEW_FILL = 'rgba(0, 0, 0, 0.07)';
const SUMMARY_VIEWPORT_GAP = 8;
let designReviewFrame: HTMLElement | null = null;

function createDesignReviewSummary(): HTMLDivElement {
  const summary = document.createElement('div');
  summary.className = 'sniptale-design-review-frame-summary';
  summary.style.cssText = `
    position: absolute;
    min-height: 22px;
    max-width: min(360px, calc(100vw - 16px));
    padding: 3px 7px;
    overflow: hidden;
    border-radius: 3px;
    background: #111827;
    box-sizing: border-box;
    color: #ffffff;
    font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    letter-spacing: 0;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  `;
  return summary;
}

function ensureDesignReviewFrame(): HTMLElement {
  if (designReviewFrame?.isConnected) {
    return designReviewFrame;
  }

  const frame = document.createElement('div');
  frame.className = 'sniptale-design-review-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `
    position: fixed;
    border: ${DESIGN_REVIEW_BORDER};
    background: ${DESIGN_REVIEW_FILL};
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    border-radius: 0;
    pointer-events: none;
    display: none;
    z-index: 2147483645;
    transition:
      left 90ms ease-out,
      top 90ms ease-out,
      width 90ms ease-out,
      height 90ms ease-out;
    will-change: left, top, width, height;
  `;
  frame.append(createDesignReviewSummary());

  appendToContentOverlayRoot(frame);
  designReviewFrame = frame;
  return frame;
}

function getElementSummary(element: Element, width: number, height: number): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList]
    .filter((className) => !className.startsWith('sniptale-'))
    .slice(0, 3)
    .map((className) => `.${className}`)
    .join('');
  return `${tag}${id}${classes} · ${Math.round(width)} × ${Math.round(height)}`;
}

function positionSummary(frame: HTMLElement, rect: ReturnType<typeof getAbsolutePosition>): void {
  const summary = frame.querySelector<HTMLElement>('.sniptale-design-review-frame-summary');
  if (!summary) return;

  const summaryRect = summary.getBoundingClientRect();
  const summaryWidth = summaryRect.width;
  const summaryHeight = summaryRect.height || 22;
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const maximumLeft = Math.max(
    SUMMARY_VIEWPORT_GAP,
    viewportWidth - summaryWidth - SUMMARY_VIEWPORT_GAP
  );
  const viewportLeft = Math.min(Math.max(rect.x, SUMMARY_VIEWPORT_GAP), maximumLeft);
  const fitsAbove = rect.y >= summaryHeight + 4 + SUMMARY_VIEWPORT_GAP;
  const fitsBelow =
    rect.y + rect.height + 4 + summaryHeight + SUMMARY_VIEWPORT_GAP <= viewportHeight;
  const preferredTop = fitsAbove
    ? rect.y - summaryHeight - 4
    : fitsBelow
      ? rect.y + rect.height + 4
      : Math.min(
          Math.max(rect.y + 4, SUMMARY_VIEWPORT_GAP),
          viewportHeight - summaryHeight - SUMMARY_VIEWPORT_GAP
        );

  summary.style.left = `${viewportLeft - rect.x}px`;
  summary.style.top = `${preferredTop - rect.y}px`;
}

function applyDesignReviewFrameRect(
  frame: HTMLElement,
  element: Element
): ReturnType<typeof getAbsolutePosition> {
  const rect = getAbsolutePosition(element);
  frame.style.left = `${rect.x}px`;
  frame.style.top = `${rect.y}px`;
  frame.style.width = `${rect.width}px`;
  frame.style.height = `${rect.height}px`;
  const summary = frame.querySelector<HTMLElement>('.sniptale-design-review-frame-summary');
  if (summary) {
    summary.textContent = getElementSummary(element, rect.width, rect.height);
  }
  return rect;
}

export function showDesignReviewFrame(element: Element): void {
  const frame = ensureDesignReviewFrame();
  const rect = applyDesignReviewFrameRect(frame, element);
  frame.style.display = 'block';
  positionSummary(frame, rect);
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
