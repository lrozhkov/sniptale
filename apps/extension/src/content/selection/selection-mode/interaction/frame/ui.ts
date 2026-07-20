import {
  updateDragFrame as updateDragFrameDom,
  updateFinalFrame as updateFinalFrameDom,
} from '../../ui';
import type { SelectionModeDom } from '../../ui/dom-types';
import type { Selection } from '../../types';

export function updateDragFrame(dom: SelectionModeDom, currentSelection: Selection): void {
  updateDragFrameDom(dom, currentSelection);
}

export function updateFinalFrame(dom: SelectionModeDom, currentSelection: Selection): void {
  updateFinalFrameDom(dom, currentSelection);
}
