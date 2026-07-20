import type { WebSnapshotManifest } from '@sniptale/runtime-contracts/web-snapshot';
import type {
  PreparationAiPickSourceAdapter,
  PreparationHostPorts,
} from '../../../content/public/preparation-surface';
import { isElementInsideSnapshotIframe } from './targets';

function resolveSourceHostname(sourceUrl: string | null | undefined, fallbackDocument: Document) {
  if (sourceUrl) {
    try {
      return new URL(sourceUrl).hostname;
    } catch {
      // Fall back to the iframe document location below.
    }
  }

  return fallbackDocument.location.hostname;
}

function createViewerAiPickSource(
  iframe: HTMLIFrameElement | null,
  manifest: WebSnapshotManifest
): PreparationAiPickSourceAdapter | null {
  const targetDocument = iframe?.contentDocument ?? null;
  const targetBody = targetDocument?.body ?? null;
  if (!iframe || !targetDocument || !targetBody) {
    return null;
  }

  const sourceUrl = manifest.source.url ?? targetDocument.location.href;
  const sourceTitle = manifest.source.title ?? targetDocument.title;

  return {
    acceptsTarget: (target) => isElementInsideSnapshotIframe(target, iframe),
    snapshotSource: {
      document: targetDocument,
      pageHostname: resolveSourceHostname(sourceUrl, targetDocument),
      pageTitle: sourceTitle,
      pageUrl: sourceUrl,
      root: targetBody,
    },
    targetIframe: iframe,
  };
}

export function createViewerAiPickSourceResolver(
  iframe: HTMLIFrameElement | null,
  manifest: WebSnapshotManifest
): PreparationHostPorts['resolveAiPickSource'] {
  return () => createViewerAiPickSource(iframe, manifest);
}
