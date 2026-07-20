import type {
  PageStyleRegistry,
  PageStyleRestoreRule,
  PageStyleScope,
  PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';
import { cloneContentRetention, clonePatch, cloneSelector } from './clone';
import { summarizePatchProperties } from './summary';
import type { SavePageStyleRestoreRuleInput, SavePageStyleTemplateInput } from './types';

function createPageStyleTemplateRecord(args: {
  createId: () => string;
  existing?: PageStyleTemplate;
  input: SavePageStyleTemplateInput;
  now: number;
}): PageStyleTemplate {
  return {
    createdAt: args.existing?.createdAt ?? args.now,
    id: args.input.id ?? args.createId(),
    name: args.input.name,
    patch: clonePatch(args.input.patch),
    propertySummary: [
      ...(args.input.propertySummary ?? summarizePatchProperties(args.input.patch)),
    ],
    updatedAt: args.now,
  };
}

export function preparePageStyleTemplateSave(args: {
  createId: () => string;
  input: SavePageStyleTemplateInput;
  now: number;
  registry: PageStyleRegistry;
}): {
  existing: PageStyleTemplate | undefined;
  registry: PageStyleRegistry;
  template: PageStyleTemplate;
} {
  const existing = args.input.id
    ? args.registry.templates.find((template) => template.id === args.input.id)
    : undefined;
  const template = createPageStyleTemplateRecord({
    createId: args.createId,
    input: args.input,
    now: args.now,
    ...(existing === undefined ? {} : { existing }),
  });
  const templates = existing
    ? args.registry.templates.map((current) => (current.id === template.id ? template : current))
    : [...args.registry.templates, template];

  return { existing, registry: { ...args.registry, templates }, template };
}

export function createPageStyleRestoreRuleRecord(args: {
  createId: () => string;
  existing?: PageStyleRestoreRule;
  input: SavePageStyleRestoreRuleInput;
  normalizeScope: (scope: PageStyleScope) => PageStyleScope;
  now: number;
}): PageStyleRestoreRule {
  const contentRetention =
    args.input.contentRetention !== undefined
      ? cloneContentRetention(args.input.contentRetention)
      : cloneContentRetention(args.existing?.contentRetention);
  const templateId =
    args.input.templateId !== undefined ? args.input.templateId : args.existing?.templateId;

  return {
    ...(contentRetention ? { contentRetention } : {}),
    createdAt: args.existing?.createdAt ?? args.now,
    enabled: args.input.enabled ?? args.existing?.enabled ?? true,
    id: args.input.id ?? args.createId(),
    name: args.input.name,
    patch: clonePatch(args.input.patch),
    propertySummary: [
      ...(args.input.propertySummary ?? summarizePatchProperties(args.input.patch)),
    ],
    scope: args.normalizeScope(args.input.scope),
    selector: cloneSelector(args.input.selector),
    ...(templateId !== undefined ? { templateId } : {}),
    updatedAt: args.now,
  };
}
