import type React from 'react';
import { getContentEventTargetElement } from '../../../../platform/dom-host';
import type { TemplateDragRef } from './types';

export function createTemplatePointerDownHandler(dragState: TemplateDragRef) {
  return (event: React.MouseEvent, id: string) => {
    if (event.button !== 0) {
      return;
    }

    if (getContentEventTargetElement(event.nativeEvent)?.closest('[data-menu-btn]')) {
      return;
    }

    dragState.current = { id, startX: event.clientX, startY: event.clientY, moved: false };
  };
}
