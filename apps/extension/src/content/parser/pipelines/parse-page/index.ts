import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';
import type { CapturedPageSnapshot } from '../../page-snapshot/types';
import { resolveParserPipelineRegistry } from '../registry';
import { resolveCandidateRoots } from './candidate-roots';
import { normalizeWithRoot } from './normalization';
import { countDocumentQuality } from './scoring';

export function parseCapturedPage(snapshot: CapturedPageSnapshot): ParsedDocument {
  const pipelineRegistry = resolveParserPipelineRegistry(snapshot.pageProfile);
  const candidateRoots = resolveCandidateRoots(snapshot, pipelineRegistry.trace.rootStrategy);
  let bestDocument: ParsedDocument | null = null;
  let bestScore = -1;

  let bestRootScore = -1;
  let bestContainerSize = Number.POSITIVE_INFINITY;
  let bestDepth = -1;

  candidateRoots.forEach(({ element, selector, rootScore = -1, containerSize, depth }) => {
    const { documentData } = normalizeWithRoot(snapshot, element, selector);
    const score = countDocumentQuality(documentData);
    const isCloseScore = Math.abs(score - bestScore) <= 25;

    const shouldReplace =
      score > bestScore + 5 ||
      (score >= bestScore - 5 && rootScore > bestRootScore + 25) ||
      (isCloseScore && containerSize < bestContainerSize) ||
      (score === bestScore && containerSize < bestContainerSize) ||
      (score === bestScore && containerSize === bestContainerSize && rootScore > bestRootScore) ||
      (score === bestScore && containerSize === bestContainerSize && depth > bestDepth);

    if (shouldReplace) {
      bestDocument = documentData;
      bestScore = score;
      bestRootScore = rootScore;
      bestContainerSize = containerSize;
      bestDepth = depth;
    }
  });

  return bestDocument ?? normalizeWithRoot(snapshot, snapshot.virtualRoot, undefined).documentData;
}
