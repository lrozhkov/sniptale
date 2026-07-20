const ISOLATED_CONTENT_ROOT_BASE_STYLE = `
  all: initial;
  display: block;
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  opacity: 1;
  visibility: visible;
  max-width: none;
  max-height: none;
  min-width: 0;
  min-height: 0;
  box-shadow: none;
  filter: none;
  backdrop-filter: none;
  transform: none;
  clip-path: none;
  isolation: isolate;
`;

/**
 * Applies a hard reset to top-level content-script roots so host-page CSS cannot restyle them.
 */
export function applyIsolatedContentRootStyle(element: HTMLElement, styleText: string): void {
  element.style.cssText = `${ISOLATED_CONTENT_ROOT_BASE_STYLE}\n${styleText}`;
}
