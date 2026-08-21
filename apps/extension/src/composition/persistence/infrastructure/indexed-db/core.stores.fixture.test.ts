import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { SUPPORTED_BETA_DATABASE_FIXTURES } from './fixtures';
import { DB_NAME, DB_VERSION, EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores.ts';
import {
  CURRENT_SCHEMA_CONTRACTS,
  DATABASE_MIGRATIONS,
  PERSISTENCE_DOMAIN_REGISTRY,
} from './schema-contracts.ts';

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

it('pins the complete released beta fixture to the database and domain registries', () => {
  const fixtureVersions = SUPPORTED_BETA_DATABASE_FIXTURES.map(
    ({ databaseVersion }) => databaseVersion
  );
  expect(fixtureVersions).toEqual(Array.from({ length: DB_VERSION }, (_value, index) => index + 1));
  for (const fixture of SUPPORTED_BETA_DATABASE_FIXTURES) {
    const { expectedDigest, ...digestInput } = fixture;
    expect(createHash('sha256').update(canonicalize(digestInput)).digest('hex')).toBe(
      expectedDigest
    );
  }
  const currentFixture = SUPPORTED_BETA_DATABASE_FIXTURES.at(-1)!;
  expect(currentFixture.databaseName).toBe(DB_NAME);
  expect(currentFixture.databaseVersion).toBe(DB_VERSION);
  expect(currentFixture.stores).toEqual(EXPECTED_STORES);
  expect(currentFixture.indexes).toEqual(EXPECTED_INDEXES);
  expect(currentFixture.domainVersions).toEqual(
    Object.fromEntries(
      PERSISTENCE_DOMAIN_REGISTRY.map(({ domainId, schemaVersion }) => [domainId, schemaVersion])
    )
  );
  expect(CURRENT_SCHEMA_CONTRACTS).toHaveLength(Object.keys(currentFixture.domainVersions).length);
  expect(DATABASE_MIGRATIONS.map(({ fromDatabaseVersion }) => fromDatabaseVersion)).toEqual(
    fixtureVersions.slice(0, -1)
  );
  const storeOwners = new Map(
    PERSISTENCE_DOMAIN_REGISTRY.flatMap(({ domainId, stores }) =>
      stores.map(({ storeName }) => [storeName, domainId] as const)
    )
  );
  for (const migration of DATABASE_MIGRATIONS) {
    const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
      ({ databaseVersion }) => databaseVersion === migration.fromDatabaseVersion
    );
    const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
      ({ databaseVersion }) => databaseVersion === migration.toDatabaseVersion
    );
    expect(migration.toDatabaseVersion).toBe(migration.fromDatabaseVersion + 1);
    expect(source).toBeDefined();
    expect(target).toBeDefined();
    if (!source || !target) continue;
    const changedDomains = Object.keys(source.domainVersions)
      .filter((domainId) => source.domainVersions[domainId] !== target.domainVersions[domainId])
      .sort();
    expect(migration.domainVersions.map(({ domainId }) => domainId).sort()).toEqual(changedDomains);
    for (const change of migration.domainVersions) {
      expect(change.from).toBe(source.domainVersions[change.domainId]);
      expect(change.to).toBe(target.domainVersions[change.domainId]);
    }
    expect(
      [...new Set(migration.stores.map((storeName) => storeOwners.get(storeName)))].sort()
    ).toEqual(changedDomains);
    if (migration.risk === 'destructive') expect(migration.backupCoverage).toBe('full');
  }
});
