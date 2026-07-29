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
  hide(target: Element | null): void;
  isOwnedTarget(target: Element | null): boolean;
  readAppearance(target: Element | null): ProjectedCursorKind;
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
  const isOwnedTarget = (target: Element | null): boolean => {
    const current = override;
    if (!current || current.target !== target) return false;
    return current.target.getAttribute(NATIVE_CURSOR_ATTRIBUTE) === ownershipToken;
  };

  return {
    dispose(): void {
      restore();
      style.remove();
      shadowCursorStyles.forEach((shadowStyle) => shadowStyle.remove());
      shadowCursorStyles.clear();
    },
    hide(target): void {
      if (target && override?.target === target && isOwnedTarget(target)) return;
      restore();
      if (!target) return;
      const nextOverride = {
        previousValue: target.getAttribute(NATIVE_CURSOR_ATTRIBUTE),
        target,
      };
      ensureCursorStyleForTarget(target);
      override = nextOverride;
      target.setAttribute(NATIVE_CURSOR_ATTRIBUTE, ownershipToken);
    },
    isOwnedTarget,
    readAppearance(target): ProjectedCursorKind {
      if (!target) return 'default';
      const current = override;
      if (!current || current.target !== target || !isOwnedTarget(target)) {
        return readProjectedCursorKind(ownerDocument, target);
      }
      if (current.previousValue === null) {
        target.removeAttribute(NATIVE_CURSOR_ATTRIBUTE);
      } else {
        target.setAttribute(NATIVE_CURSOR_ATTRIBUTE, current.previousValue);
      }
      try {
        return readProjectedCursorKind(ownerDocument, target);
      } finally {
        const exposedValue = target.getAttribute(NATIVE_CURSOR_ATTRIBUTE);
        if (override === current && exposedValue === current.previousValue) {
          target.setAttribute(NATIVE_CURSOR_ATTRIBUTE, ownershipToken);
        }
      }
    },
    restore,
    style,
  };
}
