import { useEffect } from 'react';
import type { RefObject } from 'react';
import {
  getContentEventTargetElement,
  isContentEventWithinAnyElement,
  queryAllContentUiElements,
} from '../../platform/dom-host';
import { addHighlighterModeChangedListener } from '../../platform/page-context/mode-events';
import { usePopoverDistanceClose, usePopoverOutsideClose } from '../popover-sync/hooks';

function isClickInsideAnyToolbar(event: MouseEvent) {
  const targetEl = getContentEventTargetElement(event);
  if (!targetEl) {
    return false;
  }

  if (targetEl.closest('.sniptale-action-toolbar')) {
    return true;
  }

  return isContentEventWithinAnyElement(
    event,
    queryAllContentUiElements('.sniptale-action-toolbar')
  );
}

function isClickInsideAnyPopover(event: MouseEvent) {
  return isContentEventWithinAnyElement(
    event,
    queryAllContentUiElements('.sniptale-frame-settings-popover')
  );
}

export function useFrameSettingsPopoverOutsideClose(args: {
  isOpen: boolean;
  onClose: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  usePopoverOutsideClose({
    ...args,
    shouldIgnoreOutsideEvent: (event) =>
      isClickInsideAnyToolbar(event) || isClickInsideAnyPopover(event),
  });
}

export function useFrameSettingsPopoverModeClose(args: { isOpen: boolean; onClose: () => void }) {
  const { isOpen, onClose } = args;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    return addHighlighterModeChangedListener(({ enabled }) => {
      if (!enabled) {
        onClose();
      }
    });
  }, [isOpen, onClose]);
}

export function useFrameSettingsPopoverDistanceClose(args: {
  isOpen: boolean;
  onClose: () => void;
  popoverRef: RefObject<HTMLDivElement | null>;
}) {
  usePopoverDistanceClose(args);
}
