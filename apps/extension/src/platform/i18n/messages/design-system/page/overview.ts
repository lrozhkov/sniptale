import { defineMessageSource } from '../../source';

function sentence(...parts: string[]) {
  return parts.join(' ');
}

export const designSystemPageOverviewMessages = defineMessageSource({
  documentTitle: {
    ru: 'Sniptale Design System',
    en: 'Sniptale Design System',
  },
  lightPreview: {
    ru: 'Светлый preview',
    en: 'Light preview',
  },
  darkPreview: {
    ru: 'Тёмный preview',
    en: 'Dark preview',
  },
  foundationTitle: {
    ru: 'Foundation contract',
    en: 'Foundation contract',
  },
  foundationDescription: {
    ru: sentence(
      'Страница должна не перечислять registry-поля, а быстро показывать,',
      'как выглядит и где используется каждый reusable блок.'
    ),
    en: sentence(
      'The page should not lead with registry fields.',
      'It should quickly show what each reusable block looks like and where it is used.'
    ),
  },
  foundationPointPublicLayer: {
    ru: '`@sniptale/ui` становится публичным слоем для reusable UI exports.',
    en: '`@sniptale/ui` becomes the public layer for reusable UI exports.',
  },
  foundationPointLocalPreview: {
    ru: 'Локальный preview меняет только этот root-контейнер и не записывает глобальное theme preference.',
    en: 'The page-local preview changes only this root container and does not write the global theme preference.',
  },
  foundationPointRegistry: {
    ru: 'Ниже registry хранит и русские человекочитаемые пути, и стабильные английские code id.',
    en: 'The registry below carries both Russian human-readable paths and stable English code ids.',
  },
  tokenGroupsTitle: {
    ru: 'Token groups',
    en: 'Token groups',
  },
  tokenGroupsDescription: {
    ru: sentence(
      'Semantic tokens остаются фундаментом страницы, но теперь выступают как контекст',
      'для примеров, а не как основное содержимое каталога.'
    ),
    en: sentence(
      'Semantic tokens stay the foundation of the page, but now they serve as context',
      'for examples instead of being the main catalog content.'
    ),
  },
  sharedPreviewTitle: {
    ru: 'Shared UI preview',
    en: 'Shared UI preview',
  },
  showcaseDescription: {
    ru: sentence(
      'Каждая карточка ниже собрана как mini-spec: краткое объяснение компонента,',
      'визуальный пример и реальные usage-контексты из продукта.'
    ),
    en: sentence(
      'Each card below is structured as a mini spec: a short component explanation,',
      'a visual example, and real product usage contexts.'
    ),
  },
  catalogStatsTitle: {
    ru: 'Catalog coverage',
    en: 'Catalog coverage',
  },
  catalogStatsDescription: {
    ru: sentence(
      'Каталог теперь покрывает не только публичный shared layer, но и продуктовые UI-семейства:',
      'модалки, dropdown, toolbar menus, glass controls, feedback и другие runtime-паттерны.'
    ),
    en: sentence(
      'The catalog now covers not only the public shared layer, but also product UI families:',
      'modals, dropdowns, toolbar menus, glass controls, feedback surfaces, and other runtime patterns.'
    ),
  },
  componentFamiliesLabel: {
    ru: 'UI семейств',
    en: 'UI families',
  },
  variantCoverageLabel: {
    ru: 'Вариантов',
    en: 'Variants',
  },
  usageCoverageLabel: {
    ru: 'Usage-контекстов',
    en: 'Usage contexts',
  },
  navOverview: {
    ru: 'Обзор',
    en: 'Overview',
  },
  navTokens: {
    ru: 'Токены',
    en: 'Tokens',
  },
  navSharedCatalog: {
    ru: 'Shared UI',
    en: 'Shared UI',
  },
  navProductCatalog: {
    ru: 'Product UI',
    en: 'Product UI',
  },
  searchPlaceholder: {
    ru: 'Поиск по component id, variant, usage, source file...',
    en: 'Search by component id, variant, usage, source file...',
  },
  filterAllScopes: {
    ru: 'Все слои',
    en: 'All scopes',
  },
  filterAllKinds: {
    ru: 'Все типы',
    en: 'All kinds',
  },
  filterUsageAny: {
    ru: 'Любой usage',
    en: 'Any usage',
  },
  filterUsageAll: {
    ru: 'Все usage',
    en: 'All usages',
  },
  kindPrimitive: {
    ru: 'Primitive',
    en: 'Primitive',
  },
  kindSurface: {
    ru: 'Surface',
    en: 'Surface',
  },
  kindFeedback: {
    ru: 'Feedback',
    en: 'Feedback',
  },
  kindComposition: {
    ru: 'Composition',
    en: 'Composition',
  },
  clearFilters: {
    ru: 'Сбросить',
    en: 'Clear filters',
  },
  filtersButton: {
    ru: 'Фильтры',
    en: 'Filters',
  },
  hideFiltersButton: {
    ru: 'Скрыть фильтры',
    en: 'Hide filters',
  },
  resultsLabel: {
    ru: 'Результаты',
    en: 'Results',
  },
  usageSearchPlaceholder: {
    ru: 'Поиск по usage...',
    en: 'Search usage...',
  },
  usageSearchEmpty: {
    ru: 'Подходящие usage не найдены.',
    en: 'No matching usages found.',
  },
  emptyFilterState: {
    ru: 'По текущему фильтру ничего не найдено. Ослабьте поиск или снимите часть usage-фильтров.',
    en: 'Nothing matches the current filter. Relax the search or remove some usage filters.',
  },
  sharedCatalogTitle: {
    ru: 'Shared UI layer',
    en: 'Shared UI layer',
  },
  sharedCatalogDescription: {
    ru: sentence(
      'Канонические reusable компоненты, которые должны проходить через дизайн-систему',
      'до использования в продуктовых поверхностях.'
    ),
    en: sentence(
      'Canonical reusable components that must pass through the design-system layer',
      'before being used by product surfaces.'
    ),
  },
  productCatalogTitle: {
    ru: 'Product UI catalog',
    en: 'Product UI catalog',
  },
  productCatalogDescription: {
    ru: sentence(
      'Текущие UI-семейства продукта, включая legacy и surface-specific паттерны,',
      'которые тоже должны быть видимы и описаны в каталоге.'
    ),
    en: sentence(
      'Current product UI families, including legacy and surface-specific patterns',
      'that also need to stay visible and documented in the catalog.'
    ),
  },
  scopeSharedLabel: {
    ru: 'shared-ui',
    en: 'shared-ui',
  },
  scopeProductLabel: {
    ru: 'product-ui',
    en: 'product-ui',
  },
});
