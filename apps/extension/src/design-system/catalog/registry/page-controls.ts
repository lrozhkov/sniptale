import type { DesignSystemEntryKind, DesignSystemEntryScope } from './types';

type DesignSystemPageNavigationId = 'overview' | 'tokens' | 'shared-catalog' | 'product-catalog';

type DesignSystemPageUsageMode = 'any' | 'all';

type DesignSystemPageLabelKey =
  | 'designSystem.page.navOverview'
  | 'designSystem.page.navTokens'
  | 'designSystem.page.navSharedCatalog'
  | 'designSystem.page.navProductCatalog'
  | 'designSystem.page.filterAllScopes'
  | 'designSystem.page.scopeSharedLabel'
  | 'designSystem.page.scopeProductLabel'
  | 'designSystem.page.filterAllKinds'
  | 'designSystem.page.kindPrimitive'
  | 'designSystem.page.kindSurface'
  | 'designSystem.page.kindFeedback'
  | 'designSystem.page.kindComposition'
  | 'designSystem.page.filterUsageAny'
  | 'designSystem.page.filterUsageAll';

export type DesignSystemPageNavigationMeta = {
  actionId: `design-system-nav-${DesignSystemPageNavigationId}`;
  hash: `#${DesignSystemPageNavigationId}`;
  id: DesignSystemPageNavigationId;
  labelKey: Extract<
    DesignSystemPageLabelKey,
    | 'designSystem.page.navOverview'
    | 'designSystem.page.navTokens'
    | 'designSystem.page.navSharedCatalog'
    | 'designSystem.page.navProductCatalog'
  >;
};

type DesignSystemScopeFilterMeta = {
  actionId: `design-system-scope-${'all' | 'shared' | 'product'}`;
  labelKey: Extract<
    DesignSystemPageLabelKey,
    | 'designSystem.page.filterAllScopes'
    | 'designSystem.page.scopeSharedLabel'
    | 'designSystem.page.scopeProductLabel'
  >;
  value: 'all' | DesignSystemEntryScope;
};

type DesignSystemKindFilterMeta = {
  actionId: `design-system-kind-${'all' | DesignSystemEntryKind}`;
  labelKey: Extract<
    DesignSystemPageLabelKey,
    | 'designSystem.page.filterAllKinds'
    | 'designSystem.page.kindPrimitive'
    | 'designSystem.page.kindSurface'
    | 'designSystem.page.kindFeedback'
    | 'designSystem.page.kindComposition'
  >;
  value: 'all' | DesignSystemEntryKind;
};

type DesignSystemUsageModeMeta = {
  actionId: `design-system-usage-${DesignSystemPageUsageMode}`;
  labelKey: Extract<
    DesignSystemPageLabelKey,
    'designSystem.page.filterUsageAny' | 'designSystem.page.filterUsageAll'
  >;
  value: DesignSystemPageUsageMode;
};

export const DESIGN_SYSTEM_PAGE_NAVIGATION: DesignSystemPageNavigationMeta[] = [
  {
    actionId: 'design-system-nav-overview',
    hash: '#overview',
    id: 'overview',
    labelKey: 'designSystem.page.navOverview',
  },
  {
    actionId: 'design-system-nav-tokens',
    hash: '#tokens',
    id: 'tokens',
    labelKey: 'designSystem.page.navTokens',
  },
  {
    actionId: 'design-system-nav-shared-catalog',
    hash: '#shared-catalog',
    id: 'shared-catalog',
    labelKey: 'designSystem.page.navSharedCatalog',
  },
  {
    actionId: 'design-system-nav-product-catalog',
    hash: '#product-catalog',
    id: 'product-catalog',
    labelKey: 'designSystem.page.navProductCatalog',
  },
];

export const DESIGN_SYSTEM_SCOPE_FILTERS: DesignSystemScopeFilterMeta[] = [
  {
    actionId: 'design-system-scope-all',
    labelKey: 'designSystem.page.filterAllScopes',
    value: 'all',
  },
  {
    actionId: 'design-system-scope-shared',
    labelKey: 'designSystem.page.scopeSharedLabel',
    value: 'shared-ui',
  },
  {
    actionId: 'design-system-scope-product',
    labelKey: 'designSystem.page.scopeProductLabel',
    value: 'product-ui',
  },
];

export const DESIGN_SYSTEM_KIND_FILTERS: DesignSystemKindFilterMeta[] = [
  {
    actionId: 'design-system-kind-all',
    labelKey: 'designSystem.page.filterAllKinds',
    value: 'all',
  },
  {
    actionId: 'design-system-kind-primitive',
    labelKey: 'designSystem.page.kindPrimitive',
    value: 'primitive',
  },
  {
    actionId: 'design-system-kind-surface',
    labelKey: 'designSystem.page.kindSurface',
    value: 'surface',
  },
  {
    actionId: 'design-system-kind-feedback',
    labelKey: 'designSystem.page.kindFeedback',
    value: 'feedback',
  },
  {
    actionId: 'design-system-kind-composition',
    labelKey: 'designSystem.page.kindComposition',
    value: 'composition',
  },
];

export const DESIGN_SYSTEM_USAGE_MODES: DesignSystemUsageModeMeta[] = [
  {
    actionId: 'design-system-usage-any',
    labelKey: 'designSystem.page.filterUsageAny',
    value: 'any',
  },
  {
    actionId: 'design-system-usage-all',
    labelKey: 'designSystem.page.filterUsageAll',
    value: 'all',
  },
];
