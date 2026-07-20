import {
  PAGE_STYLE_ALLOWED_PROPERTIES,
  isPageStyleInspectorTab,
  PAGE_STYLE_SCOPE_TYPES,
  type PageStyleCurrentPageRuleSummary,
  type PageStyleRuleSummary,
  type PageStyleScope,
} from '@sniptale/runtime-contracts/page-style';
import {
  hasOptionalField,
  hasRequiredField,
  isBoolean,
  isNumber,
  isRecord,
  isString,
} from './primitives';

function isPageStyleScope(value: unknown): value is PageStyleScope {
  if (!isRecord(value)) {
    return false;
  }

  const active = value['active'];
  return (
    (active === PAGE_STYLE_SCOPE_TYPES.EXACT_ADDRESS || active === PAGE_STYLE_SCOPE_TYPES.DOMAIN) &&
    hasRequiredField(value, 'exactAddress', isString) &&
    hasOptionalField(value, 'domain', (domain) => domain === null || isString(domain))
  );
}

function isPropertySummary(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isString(item) &&
        PAGE_STYLE_ALLOWED_PROPERTIES.includes(
          item as (typeof PAGE_STYLE_ALLOWED_PROPERTIES)[number]
        )
    )
  );
}

function isPageStyleRuleSummary(value: unknown): value is PageStyleRuleSummary {
  return (
    isRecord(value) &&
    hasRequiredField(value, 'enabled', isBoolean) &&
    hasRequiredField(value, 'id', isString) &&
    hasRequiredField(value, 'name', isString) &&
    hasRequiredField(value, 'propertySummary', isPropertySummary) &&
    hasRequiredField(value, 'scope', isPageStyleScope)
  );
}

export function isPageStyleCurrentPageRuleSummary(
  value: unknown
): value is PageStyleCurrentPageRuleSummary {
  return (
    isRecord(value) &&
    hasRequiredField(value, 'activeAppliedCount', isNumber) &&
    hasRequiredField(
      value,
      'matchedRules',
      (rules) => Array.isArray(rules) && rules.every(isPageStyleRuleSummary)
    ) &&
    hasRequiredField(value, 'pageUrl', isString) &&
    hasOptionalField(value, 'pageDomain', (domain) => domain === null || isString(domain))
  );
}

export { isPageStyleInspectorTab };
