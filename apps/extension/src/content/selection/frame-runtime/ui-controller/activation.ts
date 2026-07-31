import type { MutableRefObject } from 'react';
import type { FrameData } from '../../../../features/highlighter/contracts';
import type { ActiveFramePopover } from '../state/frame-ui.store';
import { getViewportClientPoint } from '../../../platform/frame';
import {
  resolveFrameControlHit,
  resolveFrameHitTarget,
  resolveFrameInteriorHitTarget,
} from './hit-test';
import { queryAllContentUiElements, queryContentUiElement } from '../../../platform/dom-host';
import { isHighlighterEnabled, isHighlighterPausedState } from '../../highlighter';
import { FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE } from '@sniptale/ui/floating-interactions/ownership';

const OWNED_FLOATING_SELECTORS = [
  '[data-ui="content.toolbar.root"]',
  '.sniptale-action-toolbar',
  '.sniptale-popover-menu',
  '.sniptale-toolbar-portal-wrapper',
  '.sniptale-frame-toolbar-trigger',
  '.sniptale-frame-toolbar-bridge',
  '.sniptale-frame-quick-action',
  '.sniptale-resize-handle',
  '.sniptale-frame-settings-popover',
  '.sniptale-frame-style-editor-layer',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
  '.sniptale-callout',
  '.sniptale-callout-format-toolbar',
  '.sniptale-callout-drag-handle',
  '.sniptale-callout-tail-handle',
  '.sniptale-callout-settings-handle',
  '.sniptale-step-badge-controls',
  '.sniptale-content-size-tooltip',
  `[${FLOATING_INTERACTION_OWNED_BY_ATTRIBUTE}]`,
];

function hasActiveFrameInteraction() {
  return (
    isHighlighterPausedState() ||
    Boolean(
      queryContentUiElement('.sniptale-content-size-tooltip') ||
      queryContentUiElement('.sniptale-callout-format-toolbar')
    )
  );
}

export function isFrameUiOwnedFloatingEvent(event: Event): boolean {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target];
  return path.some(
    (target) =>
      target instanceof Element &&
      OWNED_FLOATING_SELECTORS.some((selector) => target.matches(selector))
  );
}

function resolveBorderHit(params: {
  event: MouseEvent | PointerEvent;
  iframe?: HTMLIFrameElement;
  frames: FrameData[];
  hoveredFrameId: string | null;
  selectedFrameId: string | null;
}) {
  const point = getViewportClientPoint(params.event.clientX, params.event.clientY, params.iframe);
  return resolveFrameHitTarget({
    directControl: resolveFrameControlHit(params.event),
    frames: params.frames,
    hoveredFrameId: params.hoveredFrameId,
    selectedFrameId: params.selectedFrameId,
    x: point.x,
    y: point.y,
  });
}

function resolveInteriorHit(params: {
  event: MouseEvent | PointerEvent;
  iframe?: HTMLIFrameElement;
  frames: FrameData[];
}) {
  const point = getViewportClientPoint(params.event.clientX, params.event.clientY, params.iframe);
  return resolveFrameInteriorHitTarget({ frames: params.frames, x: point.x, y: point.y });
}

function stopFrameActivationClick(event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function escapeSelector(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

export function createFrameSelectionEventHandlers(params: {
  framesRef: MutableRefObject<FrameData[]>;
  hoveredFrameIdRef: MutableRefObject<string | null>;
  activePopoverRef: MutableRefObject<ActiveFramePopover | null>;
  selectedFrameIdRef: MutableRefObject<string | null>;
  consumeSuppressedClick: (event: MouseEvent) => boolean;
  clearSelection: () => void;
  hoverFrame: (frameId: string) => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
}) {
  return {
    pointerDown: (event: PointerEvent, iframe?: HTMLIFrameElement) => {
      if (!params.selectedFrameIdRef.current || isFrameUiOwnedFloatingEvent(event)) return;
      const borderHit = resolveBorderHit({
        event,
        frames: params.framesRef.current,
        hoveredFrameId: params.hoveredFrameIdRef.current,
        selectedFrameId: params.selectedFrameIdRef.current,
        ...(iframe ? { iframe } : {}),
      });
      const interiorHit = resolveInteriorHit({
        event,
        frames: params.framesRef.current,
        ...(iframe ? { iframe } : {}),
      });
      if (!borderHit && !interiorHit) params.clearSelection();
    },
    click: (event: MouseEvent, iframe?: HTMLIFrameElement) => {
      if (!isHighlighterEnabled() || event.button !== 0 || isFrameUiOwnedFloatingEvent(event)) {
        return;
      }
      if (params.consumeSuppressedClick(event)) {
        stopFrameActivationClick(event);
        return;
      }
      if (hasActiveFrameInteraction()) return;
      const directControl = resolveFrameControlHit(event);
      if (directControl) return;
      const borderHit = resolveBorderHit({
        event,
        frames: params.framesRef.current,
        hoveredFrameId: params.hoveredFrameIdRef.current,
        selectedFrameId: params.selectedFrameIdRef.current,
        ...(iframe ? { iframe } : {}),
      });
      if (borderHit?.kind === 'border') {
        stopFrameActivationClick(event);
        return;
      }
      const frameId = resolveInteriorHit({
        event,
        frames: params.framesRef.current,
        ...(iframe ? { iframe } : {}),
      });
      if (!frameId) return;
      stopFrameActivationClick(event);
      const point = getViewportClientPoint(event.clientX, event.clientY, iframe);
      const frame = params.framesRef.current.find(({ id }) => id === frameId);
      params.selectFrame(
        frameId,
        frame ? { x: point.x - frame.x, y: point.y - frame.y } : undefined
      );
    },
    keyDown: (event: KeyboardEvent) => {
      const selectedFrameId = params.selectedFrameIdRef.current;
      if (event.key !== 'Escape' || !selectedFrameId || hasActiveFrameInteraction()) return;
      if (params.activePopoverRef.current?.frameId === selectedFrameId) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      params.hoverFrame(selectedFrameId);
      params.clearSelection();
      requestAnimationFrame(() => {
        const trigger = queryAllContentUiElements(
          `.sniptale-frame-toolbar-trigger[data-frame-id="${escapeSelector(selectedFrameId)}"]`
        ).find((element): element is HTMLElement => element instanceof HTMLElement);
        trigger?.focus();
      });
    },
  };
}
