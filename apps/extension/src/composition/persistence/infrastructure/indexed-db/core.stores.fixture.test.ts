import { expect, it, vi } from 'vitest';
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

it('admits known-source receipts without rewriting any released rows or object bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 25
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 26
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, assetGraph: 3 });
});

it('keeps every released migration aligned with its immutable source and target schemas', async () => {
  for (const migration of DATABASE_MIGRATIONS) {
    const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
      (fixture) => fixture.databaseVersion === migration.fromDatabaseVersion
    )!;
    const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
      (fixture) => fixture.databaseVersion === migration.toDatabaseVersion
    )!;
    const names = new Set<string>(source.stores);
    const indexes = new Map<string, Set<string>>(
      Object.entries(source.indexes).map(([name, values]) => [name, new Set(values)])
    );
    const mutateRows = vi.fn();
    const createIndex = (name: string) => (index: string) => {
      indexes.get(name)?.add(index);
    };
    const db = {
      objectStoreNames: { contains: (name: string) => names.has(name) },
      createObjectStore(name: string) {
        names.add(name);
        indexes.set(name, new Set());
        return { createIndex: createIndex(name), put: mutateRows };
      },
      deleteObjectStore(name: string) {
        names.delete(name);
        indexes.delete(name);
      },
    };
    const tx = {
      abort: vi.fn(),
      objectStore: (name: string) => ({
        createIndex: createIndex(name),
        clear: mutateRows,
        delete: mutateRows,
        getAll: vi.fn(),
        put: mutateRows,
      }),
    };
    expect(migration.migrate(db, tx)).toBeUndefined();
    expect(migration.validate(db, tx)).toBeUndefined();
    expect([...names].sort()).toEqual([...target.stores].sort());
    expect(
      Object.fromEntries([...indexes].map(([name, values]) => [name, [...values].sort()]))
    ).toEqual(
      Object.fromEntries(
        Object.entries(target.indexes).map(([name, values]) => [name, [...values].sort()])
      )
    );
    expect(mutateRows).not.toHaveBeenCalled();
    expect(
      await migration.estimateAdditionalBytes({
        transaction: () => ({ store: { openCursor: async () => null } }),
      })
    ).toBeGreaterThanOrEqual(64 * 1024);
    expect(() =>
      migration.validate({ ...db, objectStoreNames: { contains: () => false } }, tx)
    ).toThrow();
  }
});

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
    const changedDomains = [
      ...new Set([...Object.keys(source.domainVersions), ...Object.keys(target.domainVersions)]),
    ]
      .filter((domainId) => source.domainVersions[domainId] !== target.domainVersions[domainId])
      .sort();
    expect(migration.domainVersions.map(({ domainId }) => domainId).sort()).toEqual(changedDomains);
    for (const change of migration.domainVersions) {
      expect(change.from).toBe(source.domainVersions[change.domainId] ?? 0);
      expect(change.to).toBe(target.domainVersions[change.domainId]);
    }
    expect(
      [...new Set(migration.stores.map((storeName) => storeOwners.get(storeName)))].sort()
    ).toEqual(changedDomains);
    if (migration.risk === 'destructive') expect(migration.backupCoverage).toBe('full');
  }
});

it('retains the source fixture data and object bytes across speech contract admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 4)!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 5)!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
});

it('retains released source rows and immutable bytes across watermark contract admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 5)!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 6)!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 5 });
});

it('retains released rows and immutable bytes across annotation contract admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 20
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 21
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 18 });
});

it('retains all released rows, history, recovery and immutable bytes across PCM profile admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 21
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 22
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 19 });
});

it('retains every released row and immutable object across bundled action-sound admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 22
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 23
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 20 });
});

it('admits bounded editor history without rewriting legacy roots, rows or immutable objects', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 23
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 24
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({
    ...source.domainVersions,
    mediaLibrary: 21,
    scenarioProjects: 7,
  });
});

it('admits permanent review project metadata without rewriting legacy heads, operations, recovery or bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 28
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 29
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 24 });
});

it('retains every version 32 row and OPFS byte when admitting recording recovery', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 32
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 33
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => !name.startsWith('recording_recovery_'))).toEqual(
    source.stores
  );
  expect(target.domainVersions).toEqual({ ...source.domainVersions, recordings: 3 });
});

it('retains every version 33 row and immutable byte across scenario framing admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 33
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 34
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, scenarioProjects: 8 });
});

it('adds private voice history without rewriting released rows media or indexes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 34
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 35
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => name !== 'voice_input_history')).toEqual(source.stores);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, voiceInputHistory: 1 });
  expect(DATABASE_MIGRATIONS.at(-1)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [{ domainId: 'voiceInputHistory', from: 0, to: 1 }],
  });
});
