import { describe, expect, it } from 'vitest';
import { EXPECTED_STORES, SCHEMA_CONTRACTS_STORE } from './core.stores.ts';
import {
  CURRENT_SCHEMA_CONTRACTS,
  PERSISTENCE_DOMAIN_REGISTRY,
  buildDatabaseMigrationPlan,
  parseStoredSchemaContracts,
  type DatabaseMigrationDescriptor,
} from './schema-contracts.ts';

describe('beta persistence domain registry', () => {
  it('assigns every product store to exactly one owner and keeps metadata infrastructure-owned', () => {
    const registeredStores = PERSISTENCE_DOMAIN_REGISTRY.flatMap((domain) =>
      domain.stores.map(({ storeName }) => storeName)
    );
    expect(new Set(registeredStores).size).toBe(registeredStores.length);
    expect([...registeredStores].sort()).toEqual(
      EXPECTED_STORES.filter((store) => store !== SCHEMA_CONTRACTS_STORE).sort()
    );
  });

  it('accepts the exact current contracts and rejects missing, duplicate, future, and malformed rows', () => {
    expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS)).toEqual(CURRENT_SCHEMA_CONTRACTS);
    expect(parseStoredSchemaContracts(CURRENT_SCHEMA_CONTRACTS.slice(1))).toBeNull();
    expect(
      parseStoredSchemaContracts([
        ...CURRENT_SCHEMA_CONTRACTS.slice(1),
        CURRENT_SCHEMA_CONTRACTS[1],
      ])
    ).toBeNull();
    expect(
      parseStoredSchemaContracts(
        CURRENT_SCHEMA_CONTRACTS.map((contract, index) =>
          index === 0 ? { ...contract, schemaVersion: 2 } : contract
        )
      )
    ).toBeNull();
    expect(parseStoredSchemaContracts({})).toBeNull();
  });
});

describe('database migration graph', () => {
  const migration = (from: number, to: number): DatabaseMigrationDescriptor => ({
    backupCoverage: 'full',
    domainVersions: [{ domainId: 'recordings', from, to }],
    estimateAdditionalBytes: async () => 0,
    fromDatabaseVersion: from,
    migrate: () => undefined,
    risk: 'transforming',
    stores: ['recordings'],
    toDatabaseVersion: to,
    validate: () => undefined,
  });

  it('builds a contiguous direct-to-current plan and rejects gaps or downgrades', () => {
    const migrations = [migration(1, 2), migration(2, 3)];
    expect(buildDatabaseMigrationPlan(1, 3, migrations)).toEqual(migrations);
    expect(buildDatabaseMigrationPlan(2, 3, migrations)).toEqual([migrations[1]]);
    expect(buildDatabaseMigrationPlan(3, 3, migrations)).toEqual([]);
    expect(buildDatabaseMigrationPlan(3, 2, migrations)).toBeNull();
    expect(buildDatabaseMigrationPlan(1, 3, [migration(1, 2)])).toBeNull();
  });
});
