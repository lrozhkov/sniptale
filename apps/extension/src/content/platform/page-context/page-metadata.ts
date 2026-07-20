import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

type ContentPageMetadata = {
  pageTitle: string;
  pageUrl: string;
};

export type ExportManagerPageMetadata = ContentPageMetadata;

export type TraversalPageMetadata = ContentPageMetadata & {
  pageHostname: string;
};

export function resolveLiveTraversalPageMetadata(): TraversalPageMetadata {
  return {
    pageHostname: window.location.hostname,
    pageTitle: document.title,
    pageUrl: window.location.href,
  };
}

export function resolveExportManagerPageMetadata(tree?: ParsedDOMTree): ExportManagerPageMetadata {
  return {
    pageTitle: tree?.meta?.title ?? tree?.title ?? document.title,
    pageUrl: tree?.meta?.url ?? window.location.href,
  };
}
