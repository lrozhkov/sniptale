import type { SelectionModeDom } from '../dom-types';
import { attachSelectionModeFinalElements } from './attach';
import { assembleSelectionModeFinalElements } from './assemble';
import type { FinalElementsOptions } from './types';

export function createSelectionModeFinalElements(
  dom: SelectionModeDom,
  options: FinalElementsOptions
): void {
  if (!dom.overlayContainer) return;

  const elements = assembleSelectionModeFinalElements(dom.overlayContainer, options);
  attachSelectionModeFinalElements(dom, elements, options);
}
