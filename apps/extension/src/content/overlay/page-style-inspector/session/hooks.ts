import { useEffect, useState } from 'react';
import { setQuickEditStyleInspectorModeEnabled } from '../../../selection/quick-edit-runtime/page-style-inspection';
import {
  findInspectablePageStyleElement,
  readPageStyleSelectionSnapshot,
  type PageStyleSelectionSnapshot,
} from '../runtime/properties';
import { isTrustedMouseEvent } from '../../../platform/trusted-events';
import { addEventListenerToAllWindowsDynamic } from '../../../platform/frame';
import { resolvePagePreparationElement } from '../../../parser/page-preparation/target';
import { addInaccessibleIframeSelectionListener } from './iframe-selection';

export function useInspectorOpenState(quickEditDocumentMode: boolean) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (quickEditDocumentMode) {
      setOpen(false);
    }
  }, [quickEditDocumentMode]);

  return { open, setOpen };
}

export function useInspectorSelection(args: {
  open: boolean;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
}) {
  const [selection, setSelection] = useState<PageStyleSelectionSnapshot | null>(null);

  useEffect(() => {
    if (!args.open || !args.quickEditMode || args.quickEditDocumentMode) {
      return;
    }

    function selectElement(eventElement: Element | null): boolean {
      const element = findInspectablePageStyleElement(eventElement);
      const snapshot = element ? readPageStyleSelectionSnapshot(element) : null;
      if (!snapshot) {
        return false;
      }

      setSelection(snapshot);
      return true;
    }

    function handleClick(event: MouseEvent, iframe?: HTMLIFrameElement) {
      if (!isTrustedMouseEvent(event)) {
        return;
      }

      if (
        !selectElement(
          resolvePagePreparationElement(event, iframe, { passThroughPassiveChrome: true })
        )
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }

    const cleanupClicks = addEventListenerToAllWindowsDynamic<MouseEvent>('click', handleClick, {
      capture: true,
    });
    const cleanupInaccessibleIframes = addInaccessibleIframeSelectionListener((iframe) => {
      selectElement(iframe);
    });
    return () => {
      cleanupClicks();
      cleanupInaccessibleIframes();
    };
  }, [args.open, args.quickEditDocumentMode, args.quickEditMode]);

  useEffect(() => {
    if (!args.quickEditMode || args.quickEditDocumentMode) {
      setSelection(null);
    }
  }, [args.quickEditDocumentMode, args.quickEditMode]);

  useEffect(() => {
    const enabled = args.open && args.quickEditMode && !args.quickEditDocumentMode;
    setQuickEditStyleInspectorModeEnabled(enabled);
    return () => setQuickEditStyleInspectorModeEnabled(false);
  }, [args.open, args.quickEditDocumentMode, args.quickEditMode]);

  return { selection, setSelection };
}
