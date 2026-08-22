import { SCHEMA_CONTRACTS_STORE } from '../core.stores.ts';
import { SUPPORTED_BETA_DATABASE_FIXTURES, type BetaDatabaseFixtureContract } from './index';

type SupportedSourceDatabaseInspection =
  | { databaseVersion: number; status: 'ready' }
  | {
      databaseVersion: number;
      reason: 'domain-contracts' | 'indexes' | 'stores';
      status: 'corrupt';
    };

interface SourceInspectionDatabase {
  getAll(storeName: string): Promise<unknown>;
  objectStoreNames: Iterable<string>;
  transaction(storeName: string): { store: { indexNames: Iterable<string> } };
  version: number;
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function storesMatchFixture(
  db: SourceInspectionDatabase,
  fixture: BetaDatabaseFixtureContract
): boolean {
  const availableStores = new Set(Array.from(db.objectStoreNames));
  return (
    availableStores.size === fixture.stores.length &&
    fixture.stores.every((storeName) => availableStores.has(storeName))
  );
}

function indexesMatchFixture(
  db: SourceInspectionDatabase,
  fixture: BetaDatabaseFixtureContract
): boolean {
  return Object.entries(fixture.indexes).every(([storeName, expectedIndexes]) => {
    const availableIndexes = new Set(Array.from(db.transaction(storeName).store.indexNames));
    return (
      availableIndexes.size === expectedIndexes.length &&
      expectedIndexes.every((index) => availableIndexes.has(index))
    );
  });
}

function parseSourceContracts(value: unknown): ReadonlyMap<string, number> | null {
  if (!Array.isArray(value)) return null;
  const contracts = new Map<string, number>();
  for (const entry of value) {
    if (!isUnknownRecord(entry)) return null;
    const domainId = entry['domainId'];
    const schemaVersion = entry['schemaVersion'];
    if (
      typeof domainId !== 'string' ||
      typeof schemaVersion !== 'number' ||
      !Number.isInteger(schemaVersion) ||
      contracts.has(domainId)
    ) {
      return null;
    }
    contracts.set(domainId, schemaVersion);
  }
  return contracts;
}

export async function inspectSupportedSourceDatabase(
  db: SourceInspectionDatabase,
  fixtures: readonly BetaDatabaseFixtureContract[] = SUPPORTED_BETA_DATABASE_FIXTURES
): Promise<SupportedSourceDatabaseInspection | null> {
  const fixture = fixtures.find(({ databaseVersion }) => databaseVersion === db.version);
  if (!fixture) return null;
  if (!storesMatchFixture(db, fixture)) {
    return { databaseVersion: db.version, reason: 'stores', status: 'corrupt' };
  }
  if (!indexesMatchFixture(db, fixture)) {
    return { databaseVersion: db.version, reason: 'indexes', status: 'corrupt' };
  }
  const contracts = parseSourceContracts(await db.getAll(SCHEMA_CONTRACTS_STORE));
  if (!contracts || contracts.size !== Object.keys(fixture.domainVersions).length) {
    return { databaseVersion: db.version, reason: 'domain-contracts', status: 'corrupt' };
  }
  const contractsMatch = Object.entries(fixture.domainVersions).every(
    ([domainId, schemaVersion]) => contracts.get(domainId) === schemaVersion
  );
  return contractsMatch
    ? { databaseVersion: db.version, status: 'ready' }
    : { databaseVersion: db.version, reason: 'domain-contracts', status: 'corrupt' };
}
