/**
 * DOM Parsers - Registry and Exports
 *
 * This module provides a modular parser architecture for extracting
 * structured data from various DOM structures:
 *
 * - GWT-specific parsers for Naumen Service Management Platform
 * - Generic parsers for standard HTML (Wikipedia, Google, etc.)
 */

import { createLogger } from '@sniptale/platform/observability/logger';
import { ParserRegistry, type TraversalContext, type ParserResult, type DOMParser } from './types';

// GWT Parsers (high priority - checked first)
import {
  GWTAttrListParser,
  GWTCommentsParser,
  GWTSectionParser,
  GWTTableParser,
  updateSectionContext,
} from './gwt';

// Generic Parsers (low priority - fallback for non-GWT sites)
import {
  DefinitionListParser,
  DetailsHierarchicalTableParser,
  DynamicFieldsEmbeddedAppParser,
  FormFieldsParser,
  KeyValueTableParser,
  MvsEmbeddedAppParser,
  PortalHomepageParser,
  SemanticSectionParser,
  ServiceCallSummaryParser,
  TextContentParser,
} from './generic';

// Re-export types
export type { TraversalContext, ParserResult, DOMParser };
export { ParserRegistry, updateSectionContext };

const logger = createLogger({ namespace: 'ContentParserRegistry' });

// Re-export parsers for direct use if needed
export {
  // GWT
  GWTSectionParser,
  GWTAttrListParser,
  GWTTableParser,
  GWTCommentsParser,
  // Generic
  DefinitionListParser,
  DetailsHierarchicalTableParser,
  KeyValueTableParser,
  DynamicFieldsEmbeddedAppParser,
  FormFieldsParser,
  MvsEmbeddedAppParser,
  PortalHomepageParser,
  SemanticSectionParser,
  ServiceCallSummaryParser,
  TextContentParser,
};

/**
 * Creates and configures the parser registry with all available parsers
 * Parsers are sorted by priority (highest first)
 */
export function createParserRegistry(): ParserRegistry {
  const registry = new ParserRegistry();

  // GWT Parsers (high priority: 70-100)
  registry.register(new GWTSectionParser()); // priority: 100
  registry.register(new GWTAttrListParser()); // priority: 90
  registry.register(new GWTTableParser()); // priority: 80
  registry.register(new GWTCommentsParser()); // priority: 70

  // Generic Parsers (low priority: 5-25)
  registry.register(new MvsEmbeddedAppParser()); // priority: 25
  registry.register(new DynamicFieldsEmbeddedAppParser()); // priority: 24
  registry.register(new PortalHomepageParser()); // priority: 23
  registry.register(new DefinitionListParser()); // priority: 20
  registry.register(new ServiceCallSummaryParser()); // priority: 19
  registry.register(new DetailsHierarchicalTableParser()); // priority: 18
  registry.register(new TextContentParser()); // priority: 15 (text content for Wikipedia)
  registry.register(new KeyValueTableParser()); // priority: 15
  registry.register(new SemanticSectionParser()); // priority: 10
  registry.register(new FormFieldsParser()); // priority: 5

  logger.log(
    'Registered parsers',
    registry
      .getParsers()
      .map((parser) => `${parser.name}(${parser.priority})`)
      .join(', ')
  );

  return registry;
}
