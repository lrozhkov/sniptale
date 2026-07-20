import { createContentRuntimeUiGuard } from '../../../platform/page-context/dom';

export const isSelectionModeExtensionUiElement = createContentRuntimeUiGuard({
  classPrefixes: ['sniptale-selection-'],
  closestSelectors: ['.sniptale-content-size-tooltip', '[class*="sniptale-selection-"]'],
});
