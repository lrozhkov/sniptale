import type {
  PageProfile,
  ParsedDocument,
  PayloadTraceEntry,
  RootSelectionTrace,
} from '@sniptale/runtime-contracts/dom-tree';
import { resolveDomTreeParserBackend } from '../../backends';
import type { DomTreeParserBackendInput } from '../../backends/contracts';
import { normalizeLegacyTree } from '../../ir/normalize-legacy-tree';
import { applyDirectExtractors } from '../direct-extractors';
import type { DirectExtractionPageContext } from '../registry/direct-extractor-routes';
import { resolveParserPipelineRegistry } from '../registry';
import { ParserBackendExecutionError } from './errors';

type ParserOrchestrationTrace = {
  detectorTrace?: PageProfile['matchedSignals'];
  payloadTrace?: PayloadTraceEntry[];
  rootSelection?: RootSelectionTrace;
};

export type ParserOrchestrationRequest = {
  pageMetadata: DirectExtractionPageContext;
  pageProfile: PageProfile;
  parseRoot: HTMLElement;
  resolveOriginalElement?: DomTreeParserBackendInput['resolveOriginalElement'];
  trace: ParserOrchestrationTrace;
};

function invokeParserBackend(
  input: DomTreeParserBackendInput
): ReturnType<ReturnType<typeof resolveDomTreeParserBackend>['parse']> {
  const backend = resolveDomTreeParserBackend();
  try {
    return backend.parse(input);
  } catch (cause) {
    throw new ParserBackendExecutionError(
      { backendId: backend.id, pageProfile: input.pageProfile },
      cause
    );
  }
}

/** Owns backend selection, normalization, direct extraction, and parser diagnostics. */
export function parseRootThroughPipeline(request: ParserOrchestrationRequest): ParsedDocument {
  const { pageMetadata, pageProfile, parseRoot, resolveOriginalElement, trace } = request;
  const pipeline = resolveParserPipelineRegistry(pageProfile);
  const backendTree = invokeParserBackend({
    pageMetadata,
    pageProfile,
    parseRoot,
    pipeline,
    ...(resolveOriginalElement === undefined ? {} : { resolveOriginalElement }),
  });
  const documentData = normalizeLegacyTree(backendTree, pageProfile, {
    ...trace,
    pageContext: pageMetadata.pageHostname,
    pageTitle: pageMetadata.pageTitle,
    pageUrl: pageMetadata.pageUrl,
    pipelineTrace: pipeline.trace,
  });

  return applyDirectExtractors(
    documentData,
    parseRoot,
    pageProfile,
    pageMetadata,
    resolveOriginalElement
  );
}
