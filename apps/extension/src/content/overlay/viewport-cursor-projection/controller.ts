import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import type { ViewportCursorProjectionAuthority } from '@sniptale/runtime-contracts/video/types/messages.content';
import {
  createProjectedCursorGlyph,
  projectedCursorSizeCssPx,
  resolveProjectedCursorKind,
  type ProjectedCursorKind,
} from './appearance';

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
  root: HTMLDivElement;
  style: HTMLStyleElement;
};

type PointerProjectionSample = {
  clientX: number;
  clientY: number;
  target: Element | null;
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

function createCursorHidingStyle(ownerDocument: Document): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.dataset['sniptaleViewportCursorStyle'] = '';
  style.textContent = 'html, html * { cursor: none !important; }';
  return style;
}

function resolvePointerTarget(event: Event): Element | null {
  const target = event
    .composedPath()
    .find((candidate) => (candidate as Node | undefined)?.nodeType === Node.ELEMENT_NODE);
  return (target as Element | undefined) ?? null;
}

function readProjectedCursorKind(
  ownerDocument: Document,
  hidingStyle: HTMLStyleElement,
  target: Element | null
): ProjectedCursorKind {
  if (!target) return 'default';
  const hidingCss = hidingStyle.textContent;
  hidingStyle.disabled = true;
  hidingStyle.textContent = '';
  try {
    const computed = ownerDocument.defaultView?.getComputedStyle(target);
    return resolveProjectedCursorKind(
      computed?.cursor ?? 'auto',
      target,
      computed?.userSelect ?? 'auto'
    );
  } finally {
    hidingStyle.textContent = hidingCss;
    hidingStyle.disabled = false;
  }
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
    ownerDocument.removeEventListener('pointermove', state.handlePointerMove, true);
    ownerDocument.removeEventListener('pointerout', state.handlePointerOut, true);
    state.root.remove();
    state.style.remove();
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
    const style = createCursorHidingStyle(ownerDocument);
    let cursorKind: ProjectedCursorKind = 'default';
    let cursorGlyph = createProjectedCursorGlyph(ownerDocument, cursorKind);
    let hasResolvedAppearance = false;
    let appearanceTarget: Element | null = null;
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
      if (!hasResolvedAppearance || appearanceTarget !== sample.target) {
        appearanceTarget = sample.target;
        hasResolvedAppearance = true;
        const nextCursorKind = readProjectedCursorKind(ownerDocument, style, sample.target);
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
      if (!Number.isFinite(pointer.clientX) || !Number.isFinite(pointer.clientY)) return;
      pendingSample = {
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        target: resolvePointerTarget(event),
      };
      pendingFrameId ??= requestAnimationFrame(flushPointerFrame);
    };
    const handlePointerOut: EventListener = (event) => {
      if ((event as PointerEvent).relatedTarget === null) {
        cancelPendingFrame();
        appearanceTarget = null;
        hasResolvedAppearance = false;
        root.style.visibility = 'hidden';
      }
    };

    addPageStyle(style);
    addOverlayNode(root);
    ownerDocument.addEventListener('pointermove', handlePointerMove, true);
    ownerDocument.addEventListener('pointerout', handlePointerOut, true);
    state = {
      authorityId,
      cancelPendingFrame,
      handlePointerMove,
      handlePointerOut,
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
