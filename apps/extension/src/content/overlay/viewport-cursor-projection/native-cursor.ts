import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { resolveProjectedCursorKind, type ProjectedCursorKind } from './appearance';

const NATIVE_CURSOR_ATTRIBUTE = 'data-sniptale-viewport-native-cursor';
const SAFE_OWNERSHIP_TOKEN = /^[A-Za-z0-9_-]+$/;

type NativeCursorOverride = {
  previousValue: string | null;
  target: Element;
};

type NativeCursorProjection = {
  dispose(): void;
  isOwnedTarget(target: Element | null): boolean;
  resolveAndHide(target: Element | null): ProjectedCursorKind;
  restore(): void;
  style: HTMLStyleElement;
};

function createCursorHidingStyle(
  ownerDocument: Document,
  ownershipToken: string
): HTMLStyleElement {
  const style = ownerDocument.createElement('style');
  style.dataset['sniptaleViewportCursorStyle'] = '';
  style.textContent = `[${NATIVE_CURSOR_ATTRIBUTE}="${ownershipToken}"] { cursor: none !important; }`;
  return style;
}

function readProjectedCursorKind(ownerDocument: Document, target: Element): ProjectedCursorKind {
  const computed = ownerDocument.defaultView?.getComputedStyle(target);
  return resolveProjectedCursorKind(
    computed?.cursor ?? 'auto',
    target,
    computed?.userSelect ?? 'auto'
  );
}

export function createNativeCursorProjection(
  ownerDocument: Document,
  ownershipToken = createSecureRandomUuid('Viewport cursor ownership token is unavailable')
): NativeCursorProjection {
  if (!SAFE_OWNERSHIP_TOKEN.test(ownershipToken)) {
    throw new Error('Viewport cursor ownership token is invalid');
  }
  const style = createCursorHidingStyle(ownerDocument, ownershipToken);
  const shadowCursorStyles = new Map<ShadowRoot, HTMLStyleElement>();
  let override: NativeCursorOverride | null = null;

  const ensureCursorStyleForTarget = (target: Element) => {
    const targetRoot = target.getRootNode();
    const shadowRootConstructor = ownerDocument.defaultView?.ShadowRoot;
    if (!shadowRootConstructor || !(targetRoot instanceof shadowRootConstructor)) return;
    if (shadowCursorStyles.has(targetRoot)) return;
    const shadowStyle = createCursorHidingStyle(ownerDocument, ownershipToken);
    targetRoot.append(shadowStyle);
    shadowCursorStyles.set(targetRoot, shadowStyle);
  };

  const restore = () => {
    const current = override;
    override = null;
    if (!current) return;
    if (current.target.getAttribute(NATIVE_CURSOR_ATTRIBUTE) !== ownershipToken) {
      return;
    }
    if (current.previousValue === null) {
      current.target.removeAttribute(NATIVE_CURSOR_ATTRIBUTE);
      return;
    }
    current.target.setAttribute(NATIVE_CURSOR_ATTRIBUTE, current.previousValue);
  };

  return {
    dispose(): void {
      restore();
      style.remove();
      shadowCursorStyles.forEach((shadowStyle) => shadowStyle.remove());
      shadowCursorStyles.clear();
    },
    isOwnedTarget(target): boolean {
      const current = override;
      if (!current || current.target !== target) return false;
      return current.target.getAttribute(NATIVE_CURSOR_ATTRIBUTE) === ownershipToken;
    },
    resolveAndHide(target): ProjectedCursorKind {
      restore();
      if (!target) return 'default';
      const previousValue = target.getAttribute(NATIVE_CURSOR_ATTRIBUTE);
      if (previousValue === ownershipToken) {
        target.removeAttribute(NATIVE_CURSOR_ATTRIBUTE);
      }
      let nextCursorKind: ProjectedCursorKind;
      try {
        nextCursorKind = readProjectedCursorKind(ownerDocument, target);
      } catch (error) {
        if (previousValue === ownershipToken) {
          target.setAttribute(NATIVE_CURSOR_ATTRIBUTE, previousValue);
        }
        throw error;
      }
      ensureCursorStyleForTarget(target);
      target.setAttribute(NATIVE_CURSOR_ATTRIBUTE, ownershipToken);
      override = { previousValue, target };
      return nextCursorKind;
    },
    restore,
    style,
  };
}
