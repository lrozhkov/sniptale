import type { CatalogDocument } from './i18n-catalog-format.mjs';
export function readI18nCatalogs(options?: { root?: string; checkFormat?: boolean }): {
  catalogs: Record<string, unknown>;
  documents: Record<string, CatalogDocument>;
  failures: string[];
};
export function runI18nCatalogCheck(options?: { root?: string }): string[];
export function collectCatalogFormatChanges(options?: { root?: string }): Array<{
  file: string;
  text: string;
}>;
