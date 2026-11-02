declare module 'sniptale:i18n/popup' {
  export const catalogs: Record<
    import('@sniptale/platform/i18n/config').AppLocale,
    import('./catalog-subsets').CatalogSubset<'popup'>
  >;
}

declare module 'sniptale:i18n/popup-shell' {
  export const catalogs: Record<
    import('@sniptale/platform/i18n/config').AppLocale,
    import('./catalog-subsets').CatalogSubset<'popup-shell'>
  >;
}

declare module 'sniptale:i18n/content-shim' {
  export const catalogs: Record<
    import('@sniptale/platform/i18n/config').AppLocale,
    import('./catalog-subsets').CatalogSubset<'content-shim'>
  >;
}
