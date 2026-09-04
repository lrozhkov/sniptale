const LAYOUT_POLICY_ATTRIBUTE = 'data-sniptale-viewer-layout-policy';
const STATIC_OVERLAY_LAYER_SELECTOR = '[data-sniptale-static-overlay-layer="true"]';

export function installSnapshotFrameLayoutPolicy(iframe: HTMLIFrameElement | null): () => void {
  const frameDocument = iframe?.contentDocument;
  if (!frameDocument) return () => undefined;

  const style = frameDocument.createElement('style');
  style.setAttribute(LAYOUT_POLICY_ATTRIBUTE, 'true');
  style.textContent = `@media screen{${STATIC_OVERLAY_LAYER_SELECTOR}{right:0!important;width:auto!important}}`;
  frameDocument.head.appendChild(style);

  return () => style.remove();
}
