/**
 * Shared types for DOM parsers
 */

import type {
  FieldNode,
  PageProfile,
  ParsedDOMTree,
  PipelineTrace,
  SectionNode,
  TableNode,
} from '@sniptale/runtime-contracts/dom-tree';

/**
 * Result from a single parser
 */
export interface ParserResult {
  fields?: FieldNode[];
  tables?: TableNode[];
  newSection?: SectionNode;
  skipChildren?: boolean; // If true, don't process children of this element
}

/**
 * Context passed through tree traversal
 */
export interface TraversalContext {
  result: ParsedDOMTree;
  currentSection: SectionNode | null;
  pageProfile?: PageProfile;
  pipelineTrace?: PipelineTrace;

  // Counters for ID generation
  sectionIndex: number;
  globalFieldIndex: number;
  globalTableIndex: number;

  // For preventing duplicate processing
  processedTables: Set<HTMLTableElement>;
  processedAttrLists: Set<HTMLTableElement>;
  processedFieldElements: Set<HTMLElement>;
  processedCommentContainers: Set<HTMLElement>; // Track processed comment containers
  processedComments: Set<HTMLElement>; // Track processed individual comments

  // Stack for tracking section nesting
  sectionElements: HTMLElement[];

  pendingFields?: Map<string, FieldNode[]>;

  // Function to get original DOM element from virtual element (for virtual DOM mode)
  getOriginalElementFn?: (node: Node) => Node | null;
}

/**
 * Abstract base class for DOM parsers
 */
export abstract class DOMParser {
  abstract name: string;
  abstract priority: number; // Higher = checked first (GWT should be high)

  /**
   * Check if this parser can handle the given element
   */
  abstract canParse(element: HTMLElement, ctx: TraversalContext): boolean;

  /**
   * Parse the element and return results
   */
  abstract parse(element: HTMLElement, ctx: TraversalContext): ParserResult;
}

/**
 * Registry for managing parsers with priority
 */
export class ParserRegistry {
  private parsers: DOMParser[] = [];

  /**
   * Register a parser (sorted by priority descending)
   */
  register(parser: DOMParser): void {
    this.parsers.push(parser);
    this.parsers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Find first parser that can handle the element
   */
  findParser(element: HTMLElement, ctx: TraversalContext): DOMParser | null {
    return this.parsers.find((p) => p.canParse(element, ctx)) || null;
  }

  /**
   * Get all registered parsers (for debugging)
   */
  getParsers(): DOMParser[] {
    return [...this.parsers];
  }
}
