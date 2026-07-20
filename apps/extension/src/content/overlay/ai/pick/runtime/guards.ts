import { createContentRuntimeUiGuard } from '../../../../platform/page-context/dom';

export const isExtensionUIElement = createContentRuntimeUiGuard({
  classNames: ['sniptale-ai-pick', 'sniptale-ai-pick-container', 'sniptale-ai-pick-hover'],
  classPrefixes: ['sniptale-'],
  extraRuntimeClasses: ['sniptale-modal'],
});

export function isNonDataInteractiveElement(target: HTMLElement): boolean {
  if (target.matches('.g-button, button, [role="button"], .buttonsGroup')) {
    return true;
  }

  const parent = target.closest('.gwt-ToolPanel, .buttonsGroup, .toolbar, .actions, .g-button');
  return parent !== null;
}
