import type { PageProfile, PipelineTrace } from '@sniptale/runtime-contracts/dom-tree';
import {
  DefinitionListParser,
  type DOMParser,
  DetailsHierarchicalTableParser,
  DynamicFieldsEmbeddedAppParser,
  FormFieldsParser,
  GWTAttrListParser,
  GWTCommentsParser,
  GWTSectionParser,
  GWTTableParser,
  KeyValueTableParser,
  MvsEmbeddedAppParser,
  ParserRegistry,
  PortalHomepageParser,
  SemanticSectionParser,
  ServiceCallSummaryParser,
  TextContentParser,
} from '../../parsers';
import { resolveParserNamesForProfile, resolveRootStrategyForProfile } from './policy';

type ParserFactory = () => DOMParser;

type ParserFactoryMap = Record<string, ParserFactory>;

export type ParserPipelineRegistry = {
  registry: ParserRegistry;
  trace: PipelineTrace;
};

const PARSER_FACTORIES: ParserFactoryMap = {
  DefinitionList: () => new DefinitionListParser(),
  DetailsHierarchicalTable: () => new DetailsHierarchicalTableParser(),
  DynamicFieldsEmbeddedApp: () => new DynamicFieldsEmbeddedAppParser(),
  FormFields: () => new FormFieldsParser(),
  GWTAttrList: () => new GWTAttrListParser(),
  GWTComments: () => new GWTCommentsParser(),
  GWTSection: () => new GWTSectionParser(),
  GWTTable: () => new GWTTableParser(),
  KeyValueTable: () => new KeyValueTableParser(),
  MvsEmbeddedApp: () => new MvsEmbeddedAppParser(),
  PortalHomepage: () => new PortalHomepageParser(),
  SemanticSection: () => new SemanticSectionParser(),
  ServiceCallSummary: () => new ServiceCallSummaryParser(),
  TextContent: () => new TextContentParser(),
};

const PIPELINE_PARSERS = {
  'generic-safe-fallback': ['DefinitionList', 'KeyValueTable', 'SemanticSection', 'TextContent'],
  'generic-structured': [
    'DefinitionList',
    'KeyValueTable',
    'SemanticSection',
    'TextContent',
    'FormFields',
  ],
  'naumen-portal': [
    'PortalHomepage',
    'ServiceCallSummary',
    'DetailsHierarchicalTable',
    'GWTComments',
    'DefinitionList',
    'KeyValueTable',
    'SemanticSection',
    'TextContent',
    'FormFields',
  ],
  'naumen-sd-gwt': [
    'GWTSection',
    'GWTAttrList',
    'GWTTable',
    'GWTComments',
    'MvsEmbeddedApp',
    'DynamicFieldsEmbeddedApp',
    'DefinitionList',
    'KeyValueTable',
    'FormFields',
  ],
} as const satisfies Record<string, string[]>;

function buildRegistry(parserNames: string[]): ParserRegistry {
  const registry = new ParserRegistry();

  parserNames.forEach((parserName) => {
    const factory = PARSER_FACTORIES[parserName];
    if (!factory) {
      throw new Error(`Unknown parser factory: ${parserName}`);
    }

    registry.register(factory());
  });

  return registry;
}

export function resolveParserPipelineRegistry(profile: PageProfile): ParserPipelineRegistry {
  const parserNames = resolveParserNamesForProfile(profile, PIPELINE_PARSERS);

  return {
    registry: buildRegistry(parserNames),
    trace: {
      parserNames,
      registryId: profile.pipelineId,
      rootStrategy: resolveRootStrategyForProfile(profile),
    },
  };
}
