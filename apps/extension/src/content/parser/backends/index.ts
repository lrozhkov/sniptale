import type { DomTreeParserBackend } from './contracts';
import { legacyTreeWalkerBackend } from './legacy-tree-walker';

/** Owns backend selection so pipeline adapters cannot reach an implementation directly. */
export function resolveDomTreeParserBackend(): DomTreeParserBackend {
  return legacyTreeWalkerBackend;
}
