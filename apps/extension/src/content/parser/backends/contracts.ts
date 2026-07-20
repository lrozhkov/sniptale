import type {
  PageProfile,
  ParsedDOMTree,
  PipelineTrace,
} from '@sniptale/runtime-contracts/dom-tree';
import type { ParserRegistry } from '../parsers';
import type {
  TraversalPageMetadata,
  VirtualDomOriginalElementResolver,
} from '../dom-tree-parser/traversal';

type DomTreeParserPipeline = {
  registry: ParserRegistry;
  trace: PipelineTrace;
};

export type DomTreeParserBackendInput = {
  pageMetadata: TraversalPageMetadata;
  pageProfile: PageProfile;
  parseRoot: HTMLElement;
  pipeline: DomTreeParserPipeline;
  resolveOriginalElement?: VirtualDomOriginalElementResolver;
};

/** Parser implementation selected by the canonical pipeline orchestrator. */
export interface DomTreeParserBackend {
  readonly id: string;
  parse(input: DomTreeParserBackendInput): ParsedDOMTree;
}
