import {
  PAGE_STYLE_SCHEMA_VERSION,
  type PageStyleRegistry,
} from '@sniptale/runtime-contracts/page-style';
import { PAGE_STYLE_LIMITS } from '@sniptale/runtime-contracts/page-style/limits';
import { isRecord } from '../../infrastructure/guards/primitives';
import { parsePageStyleRule, parsePageStyleTemplate } from './parsers';

interface ParsedPageStyleRegistry {
  hasInvalidRoot: boolean;
  invalidEntryCount: number;
  value: PageStyleRegistry;
}

function parseEntries<TEntry>(
  value: unknown,
  parser: (entry: unknown) => TEntry | null,
  maxEntries: number
): { entries: TEntry[]; invalidEntryCount: number } {
  if (!Array.isArray(value)) {
    return { entries: [], invalidEntryCount: value === undefined ? 0 : 1 };
  }

  const entries: TEntry[] = [];
  let invalidEntryCount = Math.max(0, value.length - maxEntries);

  for (const item of value.slice(0, maxEntries)) {
    const parsed = parser(item);
    if (parsed) {
      entries.push(parsed);
    } else {
      invalidEntryCount += 1;
    }
  }

  return { entries, invalidEntryCount };
}

export function createEmptyPageStyleRegistry(): PageStyleRegistry {
  return {
    restoreRules: [],
    schemaVersion: PAGE_STYLE_SCHEMA_VERSION,
    templates: [],
  };
}

export function parseStoredPageStyleRegistry(value: unknown): ParsedPageStyleRegistry {
  if (value === undefined) {
    return {
      hasInvalidRoot: false,
      invalidEntryCount: 0,
      value: createEmptyPageStyleRegistry(),
    };
  }

  if (!isRecord(value)) {
    return {
      hasInvalidRoot: true,
      invalidEntryCount: 0,
      value: createEmptyPageStyleRegistry(),
    };
  }

  const templates = parseEntries(
    value['templates'],
    parsePageStyleTemplate,
    PAGE_STYLE_LIMITS.maxRegistryTemplates
  );
  const restoreRules = parseEntries(
    value['restoreRules'],
    parsePageStyleRule,
    PAGE_STYLE_LIMITS.maxRegistryRules
  );

  return {
    hasInvalidRoot: false,
    invalidEntryCount: templates.invalidEntryCount + restoreRules.invalidEntryCount,
    value: {
      restoreRules: restoreRules.entries,
      schemaVersion: PAGE_STYLE_SCHEMA_VERSION,
      templates: templates.entries,
    },
  };
}
