import { isRestorablePageElement, isSelectablePageElement } from '../../page-element-target';
import type { PageStyleMutationElement } from './types';

export type { PageStyleMutationElement } from './types';

export function isPageStyleRestorationElement(
  element: Element
): element is PageStyleMutationElement {
  return isRestorablePageElement(element);
}

export function isPageStyleMutationElement(element: Element): element is PageStyleMutationElement {
  return isSelectablePageElement(element);
}
