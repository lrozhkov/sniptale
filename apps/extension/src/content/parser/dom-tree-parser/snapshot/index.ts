import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { type AccessibleIframeReadyResult } from '../../../platform/frame';
import { parseCapturedPage } from '../../pipelines/parse-page';
import { buildPageSnapshot } from '../../page-snapshot/runtime';
import type { PageSnapshotSource } from '../../page-snapshot/source';

export type PreparedDOMTreeSnapshot = {
  iframeReadiness: AccessibleIframeReadyResult;
  tree: ParsedDOMTree;
};

export type PreparedParsedPageSnapshot = PreparedDOMTreeSnapshot;

/**
 * Runs iframe preflight and returns both readiness diagnostics and the parsed tree.
 */
export async function prepareDOMTreeSnapshot(
  contextLabel: string,
  source?: PageSnapshotSource
): Promise<PreparedDOMTreeSnapshot> {
  return prepareParsedPageSnapshot(contextLabel, source);
}

export async function prepareParsedPageSnapshot(
  contextLabel: string,
  source?: PageSnapshotSource
): Promise<PreparedDOMTreeSnapshot> {
  const snapshot = await buildPageSnapshot(contextLabel, source);

  return {
    iframeReadiness: snapshot.iframeReadiness,
    tree: parseCapturedPage(snapshot),
  };
}

/**
 * Waits briefly for same-origin iframe documents to finish rendering before taking a synchronous
 * DOM snapshot. The parser itself remains synchronous so downstream contracts stay stable.
 */
export async function parseDOMTreeAfterIframePreflight(
  contextLabel: string,
  source?: PageSnapshotSource
): Promise<ParsedDOMTree> {
  return parsePageSnapshotAfterIframePreflight(contextLabel, source);
}

export async function parsePageSnapshotAfterIframePreflight(
  contextLabel: string,
  source?: PageSnapshotSource
): Promise<ParsedDOMTree> {
  const snapshot = await prepareParsedPageSnapshot(contextLabel, source);
  return snapshot.tree;
}
