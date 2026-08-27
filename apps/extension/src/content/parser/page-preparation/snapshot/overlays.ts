import { CONTENT_OVERLAY_ROOT_ID } from '@sniptale/ui/branding';
import { resolveContentShadowRoot } from '../../../platform/dom-host';

const STATIC_OVERLAY_SELECTORS = [
  '.sniptale-frames-container',
  '.sniptale-highlight-container',
  '.sniptale-blur-overlay',
  '.sniptale-focus-overlay',
  '.sniptale-callout',
  'svg[id^="sniptale-blur-filters"]',
];

const STATIC_OVERLAY_STYLE_ID = 'sniptale-prepared-snapshot-overlay-style';
const TRANSIENT_OVERLAY_SELECTORS = [
  '.sniptale-app',
  '.sniptale-toolbar-portal-wrapper',
  '.sniptale-frame-toolbar-trigger',
  '.sniptale-frame-toolbar-bridge',
  '.sniptale-frame-quick-action',
  '.sniptale-action-toolbar',
  '.sniptale-content-size-tooltip',
  '.sniptale-resize-handle',
  '.sniptale-callout-drag-handle',
  '.sniptale-callout-adjacent-controls',
  '.sniptale-callout-tail-handle',
  '.sniptale-callout-settings-handle',
  '.sniptale-step-badge-controls',
  '.sniptale-frame-settings-popover',
  '.sniptale-step-badge-popover',
  '.sniptale-callout-settings-popover',
  '.sniptale-callout-format-toolbar',
  '.sniptale-glass-popover',
  '.sniptale-blocking-overlay',
  '.sniptale-editing-blocking-overlay',
];

const STATIC_OVERLAY_STYLE = `
  :root {
    --sniptale-color-text-inverse: #ffffff;
    --sniptale-color-surface-base: #ffffff;
    --sniptale-color-accent: #f97316;
  }

  .sniptale-frames-container,
  .sniptale-highlight-container,
  .sniptale-blur-overlay,
  .sniptale-focus-overlay,
  .sniptale-callout {
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
`;

function resolveShadowOverlayRoot(): HTMLElement | null {
  return resolveContentShadowRoot()?.getElementById(CONTENT_OVERLAY_ROOT_ID) as HTMLElement | null;
}

function appendStaticOverlayStyle(snapshot: Document): void {
  if (snapshot.getElementById(STATIC_OVERLAY_STYLE_ID)) {
    return;
  }

  const style = snapshot.createElement('style');
  style.id = STATIC_OVERLAY_STYLE_ID;
  style.textContent = STATIC_OVERLAY_STYLE;
  snapshot.head.appendChild(style);
}

function cloneStaticOverlayNodes(sourceRoot: HTMLElement, snapshot: Document): Node[] {
  return Array.from(sourceRoot.children)
    .filter((child) => child.matches(STATIC_OVERLAY_SELECTORS.join(',')))
    .map((child) => {
      const clone = snapshot.importNode(child, true);
      for (const transient of clone.querySelectorAll(TRANSIENT_OVERLAY_SELECTORS.join(','))) {
        transient.remove();
      }
      return clone;
    });
}

export function appendStaticPagePreparationOverlays(snapshot: Document): void {
  const overlayRoot = resolveShadowOverlayRoot();
  if (!overlayRoot) {
    return;
  }

  const overlayNodes = cloneStaticOverlayNodes(overlayRoot, snapshot);
  if (overlayNodes.length === 0) {
    return;
  }

  appendStaticOverlayStyle(snapshot);
  snapshot.body.append(...overlayNodes);
}
