import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';
import { parseRootThroughPipeline } from '../orchestration';

function buildCandidateEvaluations(
  snapshot: CapturedPageSnapshot,
  selectedSelector: string | undefined
) {
  return snapshot.rootSelectionTrace.candidateEvaluations?.map((evaluation) => {
    return {
      ...evaluation,
      selected: evaluation.selector === selectedSelector,
    };
  });
}

function buildNormalizationTrace(
  snapshot: CapturedPageSnapshot,
  root: HTMLElement,
  selectedSelector: string | undefined
) {
  const payloadTrace = snapshot.payloads.map((payload) => ({
    id: payload.id,
    kind: payload.kind,
    locator: payload.locator,
    source: payload.source,
    textLength: payload.textLength,
    ...(payload.schemaTextHint === undefined ? {} : { schemaTextHint: payload.schemaTextHint }),
  }));
  const candidateEvaluations = buildCandidateEvaluations(snapshot, selectedSelector);
  const rootSelection = {
    ...snapshot.rootSelectionTrace,
    ...(selectedSelector === undefined ? {} : { selectedSelector }),
    selectedTagName: root.tagName.toLowerCase(),
    ...(candidateEvaluations === undefined ? {} : { candidateEvaluations }),
  };

  return {
    detectorTrace: snapshot.profileTrace,
    payloadTrace,
    rootSelection,
  };
}

export function normalizeWithRoot(
  snapshot: CapturedPageSnapshot,
  root: HTMLElement,
  selectedSelector: string | undefined
): {
  documentData: ParsedDocument;
} {
  return {
    documentData: parseRootThroughPipeline({
      pageMetadata: {
        pageHostname: snapshot.pageHostname,
        pageTitle: snapshot.pageTitle,
        pageUrl: snapshot.pageUrl,
      },
      pageProfile: snapshot.pageProfile,
      parseRoot: root,
      ...(snapshot.resolveOriginalElement === undefined
        ? {}
        : { resolveOriginalElement: snapshot.resolveOriginalElement }),
      trace: buildNormalizationTrace(snapshot, root, selectedSelector),
    }),
  };
}
