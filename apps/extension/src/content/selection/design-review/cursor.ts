import { mountStyleInAccessibleDocuments } from '../../platform/frame';

const DESIGN_REVIEW_CURSOR_STYLE_ID = 'sniptale-design-review-cursor-style';

function createInspectionCursor(): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">',
    '<g fill="none" stroke-linecap="round">',
    '<path d="M14 2v8M14 18v8M2 14h8M18 14h8" stroke="white" stroke-width="4"/>',
    '<circle cx="14" cy="14" r="3" stroke="white" stroke-width="4"/>',
    '<path d="M14 2v8M14 18v8M2 14h8M18 14h8" stroke="#111827" stroke-width="2"/>',
    '<circle cx="14" cy="14" r="3" stroke="#111827" stroke-width="2"/>',
    '</g>',
    '</svg>',
  ].join('');
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14, crosshair`;
}

/** Mounts the Design Review inspection cursor in the page and accessible nested documents. */
export function mountDesignReviewCursor(): () => void {
  const cursor = createInspectionCursor();
  return mountStyleInAccessibleDocuments({
    styleId: DESIGN_REVIEW_CURSOR_STYLE_ID,
    textContent: `
      *, *::before, *::after {
        cursor: ${cursor} !important;
      }
    `,
  });
}
