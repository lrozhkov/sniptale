import { useEffect, useLayoutEffect, useRef } from 'react';
import { writeSanitizedInnerHtml } from '@sniptale/platform/security/sanitizers/html';
import { CALLOUT_HTML_SANITIZER_OPTIONS, sanitizeCalloutHtml } from './html';
import {
  domRectToFrameAnnotationRect,
  identityFrameAnnotationCoordinateSpace,
  type FrameAnnotationCoordinateSpace,
} from '../coordinate-space';

function isEventWithinElement(event: Event, element: Element): boolean {
  if (event.composedPath().includes(element)) {
    return true;
  }

  return event.target instanceof Node && element.contains(event.target);
}

export function useCalloutMeasureEffect(args: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  coordinateSpace?: FrameAnnotationCoordinateSpace;
  measurementScale?: number;
  setDimensions: React.Dispatch<React.SetStateAction<{ width: number; height: number }>>;
  settingsKey: string;
}) {
  const { containerRef, setDimensions, settingsKey } = args;

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => {
      const rect = (
        args.coordinateSpace ?? identityFrameAnnotationCoordinateSpace
      ).clientRectToLogical(domRectToFrameAnnotationRect(element.getBoundingClientRect()));
      const measurementScale = Math.max(args.measurementScale ?? 1, 0.01);
      const dimensions = {
        width: rect.width / measurementScale,
        height: rect.height / measurementScale,
      };
      setDimensions((current) =>
        current.width === dimensions.width && current.height === dimensions.height
          ? current
          : dimensions
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [args.coordinateSpace, args.measurementScale, containerRef, setDimensions, settingsKey]);
}

export function useCalloutSyncContentEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  htmlContent: string;
  isEditing: boolean;
  pendingHtmlContentRef?: React.MutableRefObject<string | null>;
}) {
  const { contentEditableRef, htmlContent, isEditing, pendingHtmlContentRef } = args;

  useEffect(() => {
    const el = contentEditableRef.current;
    if (!el || isEditing) {
      return;
    }

    const sanitizedHtml = sanitizeCalloutHtml(htmlContent || '');
    const pendingHtml = pendingHtmlContentRef?.current;
    if (pendingHtml !== null && pendingHtml !== undefined) {
      if (sanitizeCalloutHtml(pendingHtml) !== sanitizedHtml) return;
      if (pendingHtmlContentRef) pendingHtmlContentRef.current = null;
    }
    if (el.innerHTML !== sanitizedHtml) {
      writeSanitizedInnerHtml(el, htmlContent || '', CALLOUT_HTML_SANITIZER_OPTIONS);
    }
  }, [contentEditableRef, htmlContent, isEditing, pendingHtmlContentRef]);
}

export function useCalloutEditingFocusEffect(args: {
  contentEditableRef: React.RefObject<HTMLDivElement | null>;
  htmlContent: string;
  isEditing: boolean;
}) {
  const { contentEditableRef, htmlContent, isEditing } = args;
  const wasEditingRef = useRef(false);

  useLayoutEffect(() => {
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
    const focusRetryId = window.requestAnimationFrame(() => {
      const interactionRoot = el.closest('.sniptale-callout') ?? el;
      const root = el.getRootNode();
      const activeElement =
        root instanceof ShadowRoot ? root.activeElement : document.activeElement;
      if (!interactionRoot.contains(activeElement)) {
        el.focus({ preventScroll: true });
      }
    });
    const selection = window.getSelection();
    if (!selection || el.childNodes.length === 0) {
      return () => window.cancelAnimationFrame(focusRetryId);
    }

    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return () => window.cancelAnimationFrame(focusRetryId);
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
          !isEventWithinElement(event, interactionRoot))
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
