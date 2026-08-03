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
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setDimensions((current) =>
        current.width === rect.width && current.height === rect.height
          ? current
          : { width: rect.width, height: rect.height }
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
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
  stopVoiceInput(): void;
  voiceActive: boolean;
}) {
  const { contentEditableRef, finishEditing, isEditing, stopVoiceInput, voiceActive } = args;

  useEffect(() => {
    if (!isEditing || !contentEditableRef.current) {
      return;
    }

    const el = contentEditableRef.current;
    const handler = (event: KeyboardEvent) => {
      const interactionRoot = el.closest('.sniptale-callout') ?? el;
      if (
        event.key !== 'Escape' ||
        (!interactionRoot.contains(document.activeElement) &&
          !isContentEventWithinElement(event, interactionRoot))
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      if (voiceActive) {
        stopVoiceInput();
        return;
      }
      finishEditing(el);
      el.blur();
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [contentEditableRef, finishEditing, isEditing, stopVoiceInput, voiceActive]);
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
