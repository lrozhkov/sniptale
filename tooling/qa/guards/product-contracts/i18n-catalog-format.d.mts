export type CatalogNode =
  | { entries: Array<{ key: string; node: CatalogNode }> }
  | { value: string };
export type CatalogDocument = { tree: CatalogNode; text: string; value: unknown };
export const I18N_CATALOG_DIRECTORY: string;
export function isI18nCatalogPath(file: string): boolean;
export function parseCatalog(text: string, file?: string): CatalogDocument;
export function catalogValue(node: CatalogNode): unknown;
export function validateCatalogShape(
  tree: CatalogNode,
  template: CatalogNode,
  file?: string,
  segments?: string[]
): string[];
export function canonicalCatalogText(tree: CatalogNode, template?: CatalogNode): string;
