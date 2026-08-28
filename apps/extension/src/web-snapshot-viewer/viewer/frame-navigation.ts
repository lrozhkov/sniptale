import { createSafeExternalHref } from '@sniptale/platform/security/safe-url';
import { WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE } from '../../features/web-snapshot/public';

interface SnapshotFrameNavigationOptions {
  externalLinksEnabled: boolean;
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
): void {
  const doc = iframe?.contentDocument;
  if (!doc) {
    return;
  }

  doc.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );

  doc.addEventListener(
    'click',
    (event) => {
      const target = findClosestAnchor(event.target);
      if (target) {
        event.preventDefault();
        event.stopPropagation();
        if (!options.externalLinksEnabled) return;
        const safeHref = createSafeExternalHref(
          target.getAttribute(WEB_SNAPSHOT_EXTERNAL_LINK_ATTRIBUTE)
        );
        if (safeHref !== null) options.onOpenExternalLink(safeHref);
      }
    },
    true
  );
}
