import { getAbsolutePosition } from '../../../../platform/frame';
import { logSelectionModeRuntime } from '../../diag';
import type { SelectionModeMutableRefs } from '../locals-contract';
import { showHoverFrame as showHoverFrameDom } from '../../ui';

export function createSelectionModeHoverFrameHandlers(refs: SelectionModeMutableRefs) {
  return {
    hideHoverFrame: () => {
      const dom = refs.dom;
      if (!dom) {
        logSelectionModeRuntime('Missing DOM during hideHoverFrame', {
          currentState: refs.currentState,
          isActive: refs.isActive,
        });
        return;
      }

      if (dom.hoverFrame) {
        dom.hoverFrame.style.display = 'none';
      }
      if (dom.hoverSizeLabel) {
        dom.hoverSizeLabel.style.display = 'none';
      }
    },
    showHoverFrameDom: (element: HTMLElement) => {
      const dom = refs.dom;
      if (!dom) {
        logSelectionModeRuntime('Missing DOM during showHoverFrame', {
          currentState: refs.currentState,
          isActive: refs.isActive,
          tagName: element.tagName,
        });
        return;
      }

      showHoverFrameDom(dom, getAbsolutePosition(element));
    },
  };
}
