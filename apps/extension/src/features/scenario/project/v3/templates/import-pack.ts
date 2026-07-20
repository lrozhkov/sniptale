import type { ScenarioTemplateDefinition } from '@sniptale/runtime-contracts/scenario/types/v3';
import { BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS } from './bundled.data.ts';
import { isScenarioTemplateDefinitionLike } from './validation';
import { SCENARIO_V3_LIMITS } from '../limits';

export interface ScenarioTemplatePackValidationResult {
  acceptedTemplates: ScenarioTemplateDefinition[];
  libraryName: string | null;
  rejectedTemplates: ScenarioRejectedTemplate[];
  warnings: string[];
}

export interface ScenarioRejectedTemplate {
  path: string;
  reason: string;
  templateId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasUnsafeTemplateFields(
  value: Record<string, unknown>,
  state = { depth: 0, visits: 0 }
): boolean {
  state.visits += 1;
  if (
    state.depth > SCENARIO_V3_LIMITS.maxRecursiveFieldDepth ||
    state.visits > SCENARIO_V3_LIMITS.maxRecursiveFieldVisits
  ) {
    return true;
  }

  return Object.entries(value).some(([key, entry]) => {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey === 'html' ||
      normalizedKey === 'css' ||
      normalizedKey === 'javascript' ||
      normalizedKey === 'script'
    ) {
      return true;
    }

    if (typeof entry === 'string') {
      const normalizedValue = entry.toLowerCase();
      return normalizedValue.includes('<script') || normalizedValue.includes('<style');
    }

    if (!isRecord(entry)) {
      return false;
    }

    state.depth += 1;
    const unsafe = hasUnsafeTemplateFields(entry, state);
    state.depth -= 1;
    return unsafe;
  });
}

function getTemplateId(value: unknown): string | null {
  return isRecord(value) && typeof value['templateId'] === 'string' ? value['templateId'] : null;
}

function getTemplatePackLibraryName(value: Record<string, unknown>): string | null {
  const library = value['library'];
  if (!isRecord(library) || typeof library['name'] !== 'string') {
    return null;
  }

  return library['name'].length <= SCENARIO_V3_LIMITS.maxNameLength && library['name'].trim()
    ? library['name']
    : null;
}

function createInvalidRootResult(): ScenarioTemplatePackValidationResult {
  return {
    acceptedTemplates: [],
    libraryName: null,
    rejectedTemplates: [{ path: '$', reason: 'invalid-root', templateId: null }],
    warnings: [],
  };
}

function validateTemplatePackEntry(
  template: unknown,
  path: string,
  bundledIds: Set<string>,
  seenIds: Set<string>
): ScenarioTemplateDefinition | ScenarioRejectedTemplate {
  const templateId = getTemplateId(template);

  if (!isRecord(template) || hasUnsafeTemplateFields(template)) {
    return { path, reason: 'unsafe-template-fields', templateId };
  }
  if (!templateId || seenIds.has(templateId) || bundledIds.has(templateId)) {
    return { path, reason: 'invalid-or-duplicate-template-id', templateId };
  }
  if (!isScenarioTemplateDefinitionLike(template)) {
    return { path, reason: 'invalid-template-shape', templateId };
  }

  seenIds.add(templateId);
  return { ...template, source: 'imported' };
}

export function validateScenarioTemplatePack(value: unknown): ScenarioTemplatePackValidationResult {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['library'])) {
    return createInvalidRootResult();
  }

  const libraryName = getTemplatePackLibraryName(value);
  const templates = Array.isArray(value['templates']) ? value['templates'] : [];
  const bundledIds = new Set<string>(
    BUNDLED_SCENARIO_TEMPLATE_DEFINITIONS.map((template) => template.templateId)
  );
  const seenIds = new Set<string>();
  const acceptedTemplates: ScenarioTemplateDefinition[] = [];
  const rejectedTemplates: ScenarioRejectedTemplate[] = [];
  const templateLimitExceeded = templates.length > SCENARIO_V3_LIMITS.maxImportedTemplates;

  if (templateLimitExceeded) {
    rejectedTemplates.push({
      path: 'templates',
      reason: 'too-many-templates',
      templateId: null,
    });
  }

  templates.slice(0, SCENARIO_V3_LIMITS.maxImportedTemplates).forEach((template, index) => {
    const result = validateTemplatePackEntry(template, `templates.${index}`, bundledIds, seenIds);
    if ('reason' in result) {
      rejectedTemplates.push(result);
    } else {
      acceptedTemplates.push(result);
    }
  });

  return {
    acceptedTemplates,
    libraryName,
    rejectedTemplates,
    warnings: libraryName ? [] : ['missing-library-name'],
  };
}
