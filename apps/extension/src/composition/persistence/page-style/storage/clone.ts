import type {
  PageStyleAssetReference,
  PageStyleContentRetention,
  PageStylePatch,
  PageStyleRegistry,
  PageStyleRestoreRule,
  PageStyleScope,
  PageStyleSelectorIdentity,
  PageStyleTemplate,
} from '@sniptale/runtime-contracts/page-style';

function cloneAssetReference(asset: PageStyleAssetReference): PageStyleAssetReference {
  return { ...asset };
}

export function clonePatch(patch: PageStylePatch): PageStylePatch {
  return {
    assets: patch.assets.map(cloneAssetReference),
    declarations: patch.declarations.map((declaration) => ({ ...declaration })),
  };
}

export function cloneContentRetention(
  retention: PageStyleContentRetention | undefined
): PageStyleContentRetention | undefined {
  if (!retention) {
    return undefined;
  }

  return {
    ...(retention.image
      ? { image: { asset: cloneAssetReference(retention.image.asset), enabled: true as const } }
      : {}),
    ...(retention.text ? { text: { enabled: true as const, text: retention.text.text } } : {}),
  };
}

export function cloneScope(scope: PageStyleScope): PageStyleScope {
  return { ...scope };
}

export function cloneSelector(selector: PageStyleSelectorIdentity): PageStyleSelectorIdentity {
  return { ...selector };
}

export function cloneTemplate(template: PageStyleTemplate): PageStyleTemplate {
  return {
    ...template,
    patch: clonePatch(template.patch),
    propertySummary: [...template.propertySummary],
  };
}

export function cloneRestoreRule(rule: PageStyleRestoreRule): PageStyleRestoreRule {
  const contentRetention = cloneContentRetention(rule.contentRetention);

  return {
    ...(contentRetention ? { contentRetention } : {}),
    createdAt: rule.createdAt,
    enabled: rule.enabled,
    id: rule.id,
    name: rule.name,
    patch: clonePatch(rule.patch),
    propertySummary: [...rule.propertySummary],
    scope: cloneScope(rule.scope),
    selector: cloneSelector(rule.selector),
    ...(rule.templateId !== undefined ? { templateId: rule.templateId } : {}),
    updatedAt: rule.updatedAt,
  };
}

export function cloneRegistry(registry: PageStyleRegistry): PageStyleRegistry {
  return {
    restoreRules: registry.restoreRules.map(cloneRestoreRule),
    schemaVersion: registry.schemaVersion,
    templates: registry.templates.map(cloneTemplate),
  };
}
