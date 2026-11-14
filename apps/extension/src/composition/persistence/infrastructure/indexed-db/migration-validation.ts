import type { UpgradeDatabase } from './upgrade/types';

/** Checks this released descriptor's required stores without reading or changing source data. */
export function requireMigrationStores(
  db: UpgradeDatabase,
  stores: readonly string[],
  diagnostic: string
): undefined {
  if (!stores.every((name) => db.objectStoreNames.contains(name))) throw new Error(diagnostic);
  return undefined;
}
