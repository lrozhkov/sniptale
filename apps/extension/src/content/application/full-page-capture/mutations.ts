import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { isContentOwnedElement } from '../../platform/dom-host';
import type {
  FloatingAnchor,
  FloatingCandidate,
  FullPageAgentSession,
  OwnedClassMutation,
  OwnedStyleMutation,
  ScrollCaptureRoot,
  VideoSnapshot,
} from './types';

const CAPTURE_STYLE_ID = 'sniptale-full-page-capture-style';
const CAPTURE_UI_HIDDEN_CLASS = 'sniptale-capture-ui-hidden';
const SCROLLBAR_CLASS = 'sniptale-full-page-scrollbar-hidden';

function addOwnedClass(
  mutations: OwnedClassMutation[],
  element: HTMLElement,
  className: string
): void {
  const wasPresent = element.classList.contains(className);
  mutations.push({ className, element, wasPresent });
  element.classList.add(className);
}

function restoreOwnedClass(mutation: OwnedClassMutation): void {
  if (!mutation.wasPresent && mutation.element.classList.contains(mutation.className)) {
    mutation.element.classList.remove(mutation.className);
  }
}

export function setOwnedStyle(
  mutations: OwnedStyleMutation[],
  element: HTMLElement,
  property: string,
  value: string,
  priority = ''
): void {
  mutations.push({
    appliedPriority: priority,
    appliedValue: value,
    element,
    priorPriority: element.style.getPropertyPriority(property),
    priorValue: element.style.getPropertyValue(property),
    property,
  });
  element.style.setProperty(property, value, priority);
}

function restoreOwnedMutation(mutation: OwnedStyleMutation): void {
  if (
    mutation.element.style.getPropertyValue(mutation.property) !== mutation.appliedValue ||
    mutation.element.style.getPropertyPriority(mutation.property) !== mutation.appliedPriority
  ) {
    return;
  }
  if (mutation.priorValue) {
    mutation.element.style.setProperty(
      mutation.property,
      mutation.priorValue,
      mutation.priorPriority
    );
  } else {
    mutation.element.style.removeProperty(mutation.property);
  }
}

function collectElements(root: Document | ShadowRoot = document): HTMLElement[] {
  const elements: HTMLElement[] = [];
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    elements.push(element);
    if (element.shadowRoot) {
      elements.push(...collectElements(element.shadowRoot));
    }
  }
  return elements;
}

function isExtensionOwnedElement(element: HTMLElement): boolean {
  if (
    isContentOwnedElement(element) ||
    element.id === 'sniptale-toolbar-portal' ||
    element.closest(`#${CONTENT_ROOT_ID}, #sniptale-toolbar-portal`) !== null
  ) {
    return true;
  }
  let root = element.getRootNode();
  while (root instanceof ShadowRoot) {
    const host = root.host;
    if (host instanceof HTMLElement && isExtensionOwnedElement(host)) return true;
    root = host.getRootNode();
  }
  return false;
}

function ownsCaptureRoot(element: HTMLElement, root: ScrollCaptureRoot): boolean {
  return root.element !== null && (element === root.element || element.contains(root.element));
}

function shouldExcludeFullViewportBackground(element: HTMLElement, rect: DOMRect): boolean {
  const style = getComputedStyle(element);
  const areaRatio =
    (Math.max(0, rect.width) * Math.max(0, rect.height)) /
    Math.max(1, window.innerWidth * window.innerHeight);
  const zIndex = Number.parseInt(style.zIndex, 10);
  return (
    areaRatio >= 0.9 &&
    (style.pointerEvents === 'none' || (Number.isFinite(zIndex) && zIndex < 0)) &&
    element.getAttribute('role') !== 'dialog' &&
    element.getAttribute('aria-modal') !== 'true'
  );
}

function resolveAnchor(rect: DOMRect): FloatingAnchor {
  const xThreshold = window.innerWidth * 0.25;
  const yThreshold = window.innerHeight * 0.25;
  let top = rect.top <= yThreshold && rect.height < window.innerHeight * 0.75;
  let bottom =
    window.innerHeight - rect.bottom <= yThreshold && rect.height < window.innerHeight * 0.75;
  let left = rect.left <= xThreshold && rect.width < window.innerWidth * 0.75;
  let right = window.innerWidth - rect.right <= xThreshold && rect.width < window.innerWidth * 0.75;
  if (top && bottom) top = bottom = false;
  if (left && right) left = right = false;
  return { bottom, center: !top && !bottom && !left && !right, left, right, top };
}

function isOutsideInternalScrollerShell(
  root: ScrollCaptureRoot,
  rect: DOMRect,
  position: 'fixed' | 'sticky'
): boolean {
  if (root.kind !== 'element' || position !== 'fixed') return false;
  const rootRect = root.element.getBoundingClientRect();
  return (
    rect.right <= rootRect.left ||
    rect.left >= rootRect.right ||
    rect.bottom <= rootRect.top ||
    rect.top >= rootRect.bottom
  );
}

export function collectFloatingCandidates(root: ScrollCaptureRoot): FloatingCandidate[] {
  return collectElements()
    .filter((element) => !isExtensionOwnedElement(element) && !ownsCaptureRoot(element, root))
    .flatMap((element): FloatingCandidate[] => {
      const style = getComputedStyle(element);
      if (
        (style.position !== 'fixed' && style.position !== 'sticky') ||
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number.parseFloat(style.opacity) === 0
      ) {
        return [];
      }
      const rect = element.getBoundingClientRect();
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        shouldExcludeFullViewportBackground(element, rect)
      ) {
        return [];
      }
      return [
        {
          appliedVisibility: null,
          anchor: resolveAnchor(rect),
          element,
          pendingShown: false,
          position: style.position as 'fixed' | 'sticky',
          priorVisibility: element.style.getPropertyValue('visibility'),
          priorVisibilityPriority: element.style.getPropertyPriority('visibility'),
          shellOnly: isOutsideInternalScrollerShell(
            root,
            rect,
            style.position as 'fixed' | 'sticky'
          ),
          shown: false,
        },
      ];
    });
}

export function preparePageMutations(session: FullPageAgentSession): void {
  const root = document.documentElement;
  const scrollStyleTargets = new Set<HTMLElement>([root]);
  if (session.root.element) scrollStyleTargets.add(session.root.element);
  for (const target of scrollStyleTargets) {
    setOwnedStyle(session.mutations, target, 'scroll-behavior', 'auto', 'important');
    setOwnedStyle(session.mutations, target, 'scroll-snap-type', 'none', 'important');
    setOwnedStyle(session.mutations, target, 'overflow-anchor', 'none', 'important');
  }
  session.hadScrollbarClass = root.classList.contains(SCROLLBAR_CLASS);
  root.classList.add(SCROLLBAR_CLASS);

  if (document.body) {
    addOwnedClass(session.classMutations, document.body, CAPTURE_UI_HIDDEN_CLASS);
  }
  const contentRoot = document.getElementById(CONTENT_ROOT_ID);
  if (contentRoot instanceof HTMLElement) {
    addOwnedClass(session.classMutations, contentRoot, CAPTURE_UI_HIDDEN_CLASS);
  }
  const legacyToolbarPortal = document.getElementById('sniptale-toolbar-portal');
  if (legacyToolbarPortal instanceof HTMLElement && legacyToolbarPortal !== contentRoot) {
    setOwnedStyle(session.mutations, legacyToolbarPortal, 'visibility', 'hidden', 'important');
  }

  const style = document.createElement('style');
  style.id = CAPTURE_STYLE_ID;
  style.textContent = `
    .${SCROLLBAR_CLASS}, .${SCROLLBAR_CLASS} * { caret-color: transparent !important; }
    .${SCROLLBAR_CLASS}::-webkit-scrollbar, .${SCROLLBAR_CLASS} *::-webkit-scrollbar { display: none !important; }
    ${
      session.preferences.freezeMotion
        ? `
      *, *::before, *::after { animation-play-state: paused !important; transition: none !important; }
    `
        : ''
    }
  `;
  document.documentElement.append(style);
  session.styleElement = style;

  if (session.preferences.freezeMotion) {
    session.videos = Array.from(document.querySelectorAll('video')).map(snapshotVideo);
  }
}

function snapshotVideo(video: HTMLVideoElement): VideoSnapshot {
  const snapshot = { currentTime: video.currentTime, video, wasPlaying: !video.paused };
  if (snapshot.wasPlaying) video.pause();
  return snapshot;
}

function fixedCandidateMatchesTile(
  candidate: FloatingCandidate,
  tile: {
    firstColumn: boolean;
    firstRow: boolean;
    lastColumn: boolean;
    lastRow: boolean;
  }
): boolean {
  if (candidate.shellOnly) return tile.firstColumn && tile.firstRow;
  const anchor = candidate.anchor;
  if (anchor.center) return tile.firstColumn && tile.firstRow;
  return (
    (!anchor.top || tile.firstRow) &&
    (!anchor.bottom || tile.lastRow) &&
    (!anchor.left || tile.firstColumn) &&
    (!anchor.right || tile.lastColumn)
  );
}

function stickyCandidateIsVisible(
  candidate: FloatingCandidate,
  session: FullPageAgentSession
): boolean {
  const rect = candidate.element.getBoundingClientRect();
  const viewport = session.geometry.rootViewport;
  return (
    rect.right > viewport.x &&
    rect.left < viewport.x + viewport.width &&
    rect.bottom > viewport.y &&
    rect.top < viewport.y + viewport.height
  );
}

export function applyFloatingPolicyForTile(
  session: FullPageAgentSession,
  tile: {
    firstColumn: boolean;
    firstRow: boolean;
    lastColumn: boolean;
    lastRow: boolean;
  }
): void {
  for (const candidate of session.floating) {
    let visible = session.preferences.floatingElements === 'repeat';
    if (session.preferences.floatingElements === 'once') {
      visible =
        candidate.position === 'fixed'
          ? fixedCandidateMatchesTile(candidate, tile)
          : !candidate.shown && stickyCandidateIsVisible(candidate, session);
      candidate.pendingShown = candidate.position === 'sticky' && visible;
    }
    const value = visible ? 'visible' : 'hidden';
    candidate.element.style.setProperty('visibility', value, 'important');
    candidate.appliedVisibility = value;
  }
}

export function commitFloatingTile(session: FullPageAgentSession): void {
  for (const candidate of session.floating) {
    if (candidate.pendingShown) {
      candidate.shown = true;
      candidate.pendingShown = false;
    }
  }
}

export function restorePageMutations(session: FullPageAgentSession): void {
  session.styleElement?.remove();
  if (!session.hadScrollbarClass) document.documentElement.classList.remove(SCROLLBAR_CLASS);
  for (const candidate of session.floating) {
    if (
      candidate.appliedVisibility === null ||
      candidate.element.style.getPropertyValue('visibility') !== candidate.appliedVisibility ||
      candidate.element.style.getPropertyPriority('visibility') !== 'important'
    ) {
      continue;
    }
    if (candidate.priorVisibility) {
      candidate.element.style.setProperty(
        'visibility',
        candidate.priorVisibility,
        candidate.priorVisibilityPriority
      );
    } else {
      candidate.element.style.removeProperty('visibility');
    }
  }
  for (const mutation of [...session.mutations].reverse()) {
    restoreOwnedMutation(mutation);
  }
  for (const mutation of [...session.classMutations].reverse()) {
    restoreOwnedClass(mutation);
  }
  for (const snapshot of session.videos) {
    if (!snapshot.video.isConnected) continue;
    if (Number.isFinite(snapshot.currentTime)) {
      try {
        snapshot.video.currentTime = snapshot.currentTime;
      } catch {
        // A page may replace or detach its media source during capture.
      }
    }
    if (snapshot.wasPlaying) void snapshot.video.play().catch(() => undefined);
  }
}
