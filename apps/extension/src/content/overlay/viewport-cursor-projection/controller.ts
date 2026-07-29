import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import type { ViewportCursorProjectionAuthority } from '@sniptale/runtime-contracts/video/types/messages.content';
import {
  createProjectedCursorGlyph,
  projectedCursorSizeCssPx,
  type ProjectedCursorKind,
} from './appearance';
import { createNativeCursorProjection } from './native-cursor';

type ViewportCursorProjectionControllerDeps = {
  addOverlayNode?: (node: HTMLElement) => void;
  addPageStyle?: (node: HTMLStyleElement) => void;
  applyRootStyle?: (node: HTMLElement, styleText: string) => void;
  document?: Document;
};

type ProjectionState = {
  authorityId: string;
  cancelPendingFrame: () => void;
  handlePointerMove: EventListener;
  handlePointerOut: EventListener;
  pointerMoveEventName: 'pointermove' | 'pointerrawupdate';
  disposeNativeCursor: () => void;
  root: HTMLDivElement;
  style: HTMLStyleElement;
};

type PointerProjectionSample = {
  clientX: number;
  clientY: number;
  target: Element | null;
  targetRevision: number;
};

type ViewportCursorProjectionController = {
  disable(authority: ViewportCursorProjectionAuthority): void;
  dispose(): void;
  enable(authority: ViewportCursorProjectionAuthority): boolean;
  isEnabled(): boolean;
};

function getAuthorityId(authority: ViewportCursorProjectionAuthority): string {
  return JSON.stringify([authority.recordingId, authority.generation]);
}

function createProjectionRoot(
  ownerDocument: Document,
  applyRootStyle: (node: HTMLElement, styleText: string) => void
): HTMLDivElement {
  const root = ownerDocument.createElement('div');
  root.dataset['sniptaleViewportCursor'] = '';
  root.setAttribute('aria-hidden', 'true');
  applyRootStyle(
    root,
    `
      position: fixed;
      inset: 0 auto auto 0;
      width: ${projectedCursorSizeCssPx}px;
      height: ${projectedCursorSizeCssPx}px;
      pointer-events: none;
      visibility: hidden;
      transform: translate3d(-64px, -64px, 0);
      transform-origin: 0 0;
      will-change: transform;
      z-index: 2147483647;
    `
  );
  return root;
}

function resolvePointerTarget(event: Event): Element | null {
  const target = event
    .composedPath()
    .find((candidate) => (candidate as Node | undefined)?.nodeType === Node.ELEMENT_NODE);
  return (target as Element | undefined) ?? null;
}

function readLatestPointerPosition(event: PointerEvent): { clientX: number; clientY: number } {
  const coalesced =
    typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
  const latest = coalesced.at(-1) ?? event;
  return { clientX: latest.clientX, clientY: latest.clientY };
}

export function createViewportCursorProjectionController(
  deps: ViewportCursorProjectionControllerDeps = {}
): ViewportCursorProjectionController {
  const ownerDocument = deps.document ?? document;
  const addOverlayNode =
    deps.addOverlayNode ?? ((node: HTMLElement) => void appendToContentOverlayRoot(node));
  const addPageStyle =
    deps.addPageStyle ??
    ((node: HTMLStyleElement) => {
      (ownerDocument.head ?? ownerDocument.documentElement).append(node);
    });
  const applyRootStyle = deps.applyRootStyle ?? applyIsolatedContentRootStyle;
  let state: ProjectionState | null = null;
  const retiredAuthorityIds = new Set<string>();

  function removeProjection(): void {
    if (!state) return;
    state.cancelPendingFrame();
    ownerDocument.removeEventListener(state.pointerMoveEventName, state.handlePointerMove, true);
    ownerDocument.removeEventListener('pointerout', state.handlePointerOut, true);
    state.root.remove();
    state.disposeNativeCursor();
    state = null;
  }

  function disable(authority: ViewportCursorProjectionAuthority): void {
    const authorityId = getAuthorityId(authority);
    retiredAuthorityIds.add(authorityId);
    if (state?.authorityId === authorityId) removeProjection();
  }

  function enable(authority: ViewportCursorProjectionAuthority): boolean {
    const authorityId = getAuthorityId(authority);
    if (retiredAuthorityIds.has(authorityId)) return false;
    if (state?.authorityId !== undefined && state.authorityId !== authorityId) return false;
    if (state?.root.isConnected && state.style.isConnected) return true;
    removeProjection();

    const root = createProjectionRoot(ownerDocument, applyRootStyle);
    const nativeCursor = createNativeCursorProjection(ownerDocument);
    const style = nativeCursor.style;
    const pointerMoveEventName =
      ownerDocument.defaultView && 'onpointerrawupdate' in ownerDocument.defaultView
        ? 'pointerrawupdate'
        : 'pointermove';
    let cursorKind: ProjectedCursorKind = 'default';
    let cursorGlyph = createProjectedCursorGlyph(ownerDocument, cursorKind);
    let appearanceRevision = -1;
    let hiddenTarget: Element | null = null;
    let hiddenTargetRevision = 0;
    let pendingFrameId: number | null = null;
    let pendingSample: PointerProjectionSample | null = null;
    root.dataset['cursorKind'] = cursorKind;
    if (cursorGlyph.node) root.append(cursorGlyph.node);
    const cancelPendingFrame = () => {
      if (pendingFrameId !== null) cancelAnimationFrame(pendingFrameId);
      pendingFrameId = null;
      pendingSample = null;
    };
    const applyPointerSample = (sample: PointerProjectionSample) => {
      if (appearanceRevision !== sample.targetRevision) {
        appearanceRevision = sample.targetRevision;
        const nextCursorKind = nativeCursor.readAppearance(sample.target);
        if (nextCursorKind !== cursorKind) {
          cursorKind = nextCursorKind;
          cursorGlyph = createProjectedCursorGlyph(ownerDocument, cursorKind);
          root.dataset['cursorKind'] = cursorKind;
          root.replaceChildren(...(cursorGlyph.node ? [cursorGlyph.node] : []));
        }
      }
      if (!cursorGlyph.node) {
        root.style.visibility = 'hidden';
        return;
      }
      const projectedX = sample.clientX - cursorGlyph.hotspot.x;
      const projectedY = sample.clientY - cursorGlyph.hotspot.y;
      root.style.transform = `translate3d(${projectedX}px, ${projectedY}px, 0)`;
      root.style.visibility = 'visible';
    };
    const flushPointerFrame: FrameRequestCallback = () => {
      pendingFrameId = null;
      const sample = pendingSample;
      pendingSample = null;
      if (!sample || state?.authorityId !== authorityId || state.root !== root) return;
      applyPointerSample(sample);
    };
    const handlePointerMove: EventListener = (event) => {
      const pointer = event as PointerEvent;
      const position = readLatestPointerPosition(pointer);
      if (!Number.isFinite(position.clientX) || !Number.isFinite(position.clientY)) return;
      const target = resolvePointerTarget(event);
      if (hiddenTarget !== target || (target !== null && !nativeCursor.isOwnedTarget(target))) {
        nativeCursor.hide(target);
        hiddenTarget = target;
        hiddenTargetRevision += 1;
      }
      pendingSample = {
        clientX: position.clientX,
        clientY: position.clientY,
        target,
        targetRevision: hiddenTargetRevision,
      };
      pendingFrameId ??= requestAnimationFrame(flushPointerFrame);
    };
    const handlePointerOut: EventListener = (event) => {
      if ((event as PointerEvent).relatedTarget === null) {
        cancelPendingFrame();
        nativeCursor.restore();
        hiddenTarget = null;
        hiddenTargetRevision += 1;
        root.style.visibility = 'hidden';
      }
    };

    addPageStyle(style);
    addOverlayNode(root);
    ownerDocument.addEventListener(pointerMoveEventName, handlePointerMove, true);
    ownerDocument.addEventListener('pointerout', handlePointerOut, true);
    state = {
      authorityId,
      cancelPendingFrame,
      handlePointerMove,
      handlePointerOut,
      pointerMoveEventName,
      disposeNativeCursor: nativeCursor.dispose,
      root,
      style,
    };
    return true;
  }

  return {
    disable,
    dispose: removeProjection,
    enable,
    isEnabled: () => state !== null,
  };
}
