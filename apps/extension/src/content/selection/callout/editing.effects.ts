import { useEffect, useRef } from 'react';
import { writeSanitizedInnerHtml } from '@sniptale/platform/security/sanitizers/html';
import { isContentEventWithinElement } from '../../platform/dom-host';
import { addCalloutBlurRequestListener } from '../../platform/page-context/frame-events';
import { CALLOUT_HTML_SANITIZER_OPTIONS, sanitizeCalloutHtml } from './dom';

export function useCalloutMeasureEffect(args: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  setDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  settingsKey: string;
}) {
  const { containerRef, setDimensions, settingsKey } = args;

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    setDimensions({ width: rect.width, height: rect.height });
  }, [containerRef, setDimensions, settingsKey]);
}

export function useCalloutSyncContentEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  htmlContent: string;
  isEditing: boolean;
}) {
  const { contentEditableRef, htmlContent, isEditing } = args;

  useEffect(() => {
    const el = contentEditableRef.current;
    if (!el || isEditing) {
      return;
    }

    const sanitizedHtml = sanitizeCalloutHtml(htmlContent || '');
    if (el.innerHTML !== sanitizedHtml) {
      writeSanitizedInnerHtml(el, htmlContent || '', CALLOUT_HTML_SANITIZER_OPTIONS);
    }
  }, [contentEditableRef, htmlContent, isEditing]);
}

export function useCalloutEditingFocusEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  htmlContent: string;
  isEditing: boolean;
}) {
  const { contentEditableRef, htmlContent, isEditing } = args;
  const wasEditingRef = useRef(false);

  useEffect(() => {
    if (!isEditing) {
      wasEditingRef.current = false;
      return;
    }

    if (!contentEditableRef.current) {
      return;
    }

    const didEnterEditing = !wasEditingRef.current;
    wasEditingRef.current = true;
    if (!didEnterEditing) {
      return;
    }

    const el = contentEditableRef.current;
    if (!el.innerHTML && htmlContent) {
      writeSanitizedInnerHtml(el, htmlContent, CALLOUT_HTML_SANITIZER_OPTIONS);
    }

    el.focus();
    const selection = window.getSelection();
    if (!selection || el.childNodes.length === 0) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [contentEditableRef, htmlContent, isEditing]);
}

export function useCalloutEscapeCaptureEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
  isEditing: boolean;
}) {
  const { contentEditableRef, finishEditing, isEditing } = args;

  useEffect(() => {
    if (!isEditing || !contentEditableRef.current) {
      return;
    }

    const el = contentEditableRef.current;
    const handler = (event: KeyboardEvent) => {
      if (
        event.key !== 'Escape' ||
        (!el.contains(document.activeElement) && !isContentEventWithinElement(event, el))
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      finishEditing(el);
      el.blur();
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [contentEditableRef, finishEditing, isEditing]);
}

export function useCalloutSelectionChangeEffect(args: {
  isEditing: boolean;
  setFloatingToolbarRect: React.Dispatch<React.SetStateAction<DOMRect | null>>;
}) {
  const { isEditing, setFloatingToolbarRect } = args;

  useEffect(() => {
    const handleSelectionChange = () => {
      if (!isEditing) {
        setFloatingToolbarRect(null);
        return;
      }

      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
        setFloatingToolbarRect(selection.getRangeAt(0).getBoundingClientRect());
        return;
      }

      setFloatingToolbarRect(null);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [isEditing, setFloatingToolbarRect]);
}

export function useCalloutBlurRequestEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  finishEditing: (editableElement?: HTMLDivElement | null) => void;
  frameId: string;
}) {
  const { contentEditableRef, finishEditing, frameId } = args;

  useEffect(() => {
    return addCalloutBlurRequestListener(({ frameId: requestedFrameId }) => {
      if (requestedFrameId === frameId && contentEditableRef.current) {
        finishEditing(contentEditableRef.current);
        contentEditableRef.current.blur();
      }
    });
  }, [contentEditableRef, finishEditing, frameId]);
}
