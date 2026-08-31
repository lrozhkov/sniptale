import { createSafeExternalHref } from '@sniptale/platform/security/safe-url';
import { WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE } from '../../features/web-snapshot/public';

interface SnapshotFrameNavigationOptions {
  externalLinksEnabled: boolean;
  onExternalLinkPreviewChange: (href: string | null) => void;
  onOpenExternalLink: (href: string) => void;
}

function findClosestAnchor(target: EventTarget | null): Element | null {
  if (target === null || typeof (target as { closest?: unknown }).closest !== 'function') {
    return null;
  }
  return (target as unknown as { closest: (selector: string) => Element | null }).closest('a');
}

export function blockSnapshotFrameNavigation(
  iframe: HTMLIFrameElement | null,
  options: SnapshotFrameNavigationOptions
): () => void {
  const doc = iframe?.contentDocument;
  if (!doc) {
    return () => undefined;
  }

  const handleSubmit = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  const handleClick = (event: MouseEvent) => {
    const target = findClosestAnchor(event.target);
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    if (!options.externalLinksEnabled) return;
    const safeHref = createSafeExternalHref(
      target.getAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE)
    );
    if (safeHref !== null) options.onOpenExternalLink(safeHref);
  };
  const handleMouseOver = (event: MouseEvent) => {
    if (!options.externalLinksEnabled) return;
    const target = findClosestAnchor(event.target);
    const safeHref = createSafeExternalHref(
      target?.getAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE) ?? null
    );
    options.onExternalLinkPreviewChange(safeHref);
  };
  const handleMouseOut = (event: MouseEvent) => {
    const target = findClosestAnchor(event.target);
    if (!target || target === findClosestAnchor(event.relatedTarget)) return;
    options.onExternalLinkPreviewChange(null);
  };

  doc.addEventListener('submit', handleSubmit, true);
  doc.addEventListener('click', handleClick, true);
  doc.addEventListener('mouseover', handleMouseOver, true);
  doc.addEventListener('mouseout', handleMouseOut, true);

  return () => {
    doc.removeEventListener('submit', handleSubmit, true);
    doc.removeEventListener('click', handleClick, true);
    doc.removeEventListener('mouseover', handleMouseOver, true);
    doc.removeEventListener('mouseout', handleMouseOut, true);
    options.onExternalLinkPreviewChange(null);
  };
}
