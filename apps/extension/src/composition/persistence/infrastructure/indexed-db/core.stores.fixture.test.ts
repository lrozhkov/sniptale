import { imageAppV54Fixture } from './fixtures/image-app-v54';
import { imageAppV55Fixture } from './fixtures/image-app-v55';
import { betaV59Fixture } from './fixtures/beta-v59';
import { afterEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { SUPPORTED_BETA_DATABASE_FIXTURES } from './fixtures';
import { nativeAppV47Fixture } from './fixtures/native-app-v47';
import { nativeAppV48Fixture } from './fixtures/native-app-v48';
import { DB_NAME, DB_VERSION, EXPECTED_INDEXES, EXPECTED_STORES } from './core.stores.ts';
import {
  CURRENT_SCHEMA_CONTRACTS,
  DATABASE_MIGRATIONS,
  PERSISTENCE_DOMAIN_REGISTRY,
  buildDatabaseMigrationPlan,
  parseStoredSchemaContracts,
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
  vi.stubGlobal('IDBKeyRange', { bound: (lower: string, upper: string) => ({ lower, upper }) });
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
        openCursor: async () => null,
        index: () => ({ getAll: async () => [] }),
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
        transaction: () => ({
          store: {
            openCursor: async () => null,
            count: async () => 0,
            index: () => ({ count: async () => 0 }),
          },
        }),
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
  for (const fixture of [
    ...SUPPORTED_BETA_DATABASE_FIXTURES,
    imageAppV54Fixture,
    imageAppV55Fixture,
    nativeAppV47Fixture,
    nativeAppV48Fixture,
  ]) {
    const { expectedDigest, ...digestInput } = fixture;
    const actualDigest = createHash('sha256').update(canonicalize(digestInput)).digest('hex');
    expect(actualDigest, `Database ${fixture.databaseVersion} digest ${actualDigest}`).toBe(
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
  expect(DATABASE_MIGRATIONS.find((step) => step.toDatabaseVersion === 35)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [{ domainId: 'voiceInputHistory', from: 0, to: 1 }],
  });
});

it('admits independent quick projects without rewriting released sources or workspace rows', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 35
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 36
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 28 });
  expect(DATABASE_MIGRATIONS.find((step) => step.toDatabaseVersion === 36)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [{ domainId: 'mediaLibrary', from: 27, to: 28 }],
  });
});

it('admits camera screen behavior without rewriting released projects, history or bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 36
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 37);
  expect(target).toBeDefined();
  expect(target?.records).toEqual(source.records);
  expect(target?.opfsObjects).toEqual(source.opfsObjects);
  expect(target?.stores).toEqual(source.stores);
  expect(target?.indexes).toEqual(source.indexes);
  expect(target?.domainVersions).toEqual({
    ...source.domainVersions,
    mediaLibrary: 29,
    videoProjects: 6,
  });
  expect(DATABASE_MIGRATIONS.find((step) => step.toDatabaseVersion === 37)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 28, to: 29 },
      { domainId: 'videoProjects', from: 5, to: 6 },
    ],
  });
});

it('admits camera shadow direction without rewriting released projects, history or bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 37
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 38);
  expect(target).toBeDefined();
  expect(target?.records).toEqual(source.records);
  expect(target?.opfsObjects).toEqual(source.opfsObjects);
  expect(target?.stores).toEqual(source.stores);
  expect(target?.indexes).toEqual(source.indexes);
  expect(target?.domainVersions).toEqual({
    ...source.domainVersions,
    mediaLibrary: 30,
    videoProjects: 7,
  });
  expect(DATABASE_MIGRATIONS.find((step) => step.toDatabaseVersion === 38)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 29, to: 30 },
      { domainId: 'videoProjects', from: 6, to: 7 },
    ],
  });
});

it('admits border origins and two-sided phases without rewriting released projects, history or bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 38
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 39);
  expect(target).toBeDefined();
  expect(target?.records).toEqual(source.records);
  expect(target?.opfsObjects).toEqual(source.opfsObjects);
  expect(target?.stores).toEqual(source.stores);
  expect(target?.indexes).toEqual(source.indexes);
  expect(target?.domainVersions).toEqual({
    ...source.domainVersions,
    mediaLibrary: 31,
    videoProjects: 8,
  });
  expect(DATABASE_MIGRATIONS.find((step) => step.toDatabaseVersion === 39)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [
      { domainId: 'mediaLibrary', from: 30, to: 31 },
      { domainId: 'videoProjects', from: 7, to: 8 },
    ],
  });
});

it('adds empty capture and native revision stores without rewriting version 39 rows or OPFS objects', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 39
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 40
  )!;
  expect(target.records).toEqual({
    ...source.records,
    sync_capture: [],
    video_project_revisions: [],
  });
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(
    target.stores.filter((name) => name !== 'sync_capture' && name !== 'video_project_revisions')
  ).toEqual(source.stores);
  expect(target.indexes).toEqual({
    ...source.indexes,
    sync_capture: ['kind', 'rootKey', 'createdAt'],
    video_project_revisions: [],
  });
  expect(target.domainVersions).toEqual({
    ...source.domainVersions,
    syncCapture: 1,
    videoProjects: 9,
  });
  expect(
    PERSISTENCE_DOMAIN_REGISTRY.find((domain) => domain.domainId === 'videoProjects')
  ).toMatchObject({
    schemaVersion: 13,
    stores: expect.arrayContaining([
      { storeName: 'video_project_revisions', dataClass: 'durable-authority' },
    ]),
  });
  expect(PERSISTENCE_DOMAIN_REGISTRY.find((domain) => domain.domainId === 'syncCapture')).toEqual({
    domainId: 'syncCapture',
    schemaVersion: 10,
    stores: [
      { storeName: 'sync_capture', dataClass: 'durable-authority' },
      { storeName: 'sync_outbox', dataClass: 'durable-authority' },
      { storeName: 'sync_catalog_cache', dataClass: 'derived-rebuildable' },
      { storeName: 'sync_connection', dataClass: 'durable-authority' },
    ],
  });
});

it('adds an empty outgoing store without rewriting version 40 rows or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 40
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 41
  )!;
  expect(target.records).toEqual({ ...source.records, sync_outbox: [] });
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => name !== 'sync_outbox')).toEqual(source.stores);
  expect(target.indexes).toEqual({ ...source.indexes, sync_outbox: [] });
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 2 });
});

it('retains populated version 40 capture rows and profiles during outgoing admission', () => {
  const profile = {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'retained',
    connectionGeneration: 3,
  };
  const capture = {
    version: 1,
    kind: 'captured-change',
    key: '["change","retained-op"]',
    createdAt: 2,
    spaceId: 'retained',
    connectionGeneration: 3,
    rootKind: 'media',
    rootId: 'source',
    rootKey: '["retained","media","source"]',
    generation: 1,
    operationId: 'retained-op',
    basis: [],
    origin: 'local-edit',
    publicationId: null,
    change: { kind: 'tombstone' },
  };
  const rows = new Map<string, unknown[]>([['sync_capture', [profile, capture]]]);
  const before = structuredClone(rows);
  const sourceAccess = vi.fn(() => {
    throw new Error('Released rows must remain untouched.');
  });
  const db = {
    objectStoreNames: { contains: (name: string) => rows.has(name) },
    createObjectStore(name: string) {
      rows.set(name, []);
      return { createIndex: sourceAccess, put: sourceAccess };
    },
    deleteObjectStore: sourceAccess,
  };
  const tx = { abort: vi.fn(), objectStore: sourceAccess };
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 40)!;
  expect(migration.migrate(db, tx)).toBeUndefined();
  expect(migration.validate(db, tx)).toBeUndefined();
  expect(rows.get('sync_capture')).toEqual(before.get('sync_capture'));
  expect(rows.get('sync_outbox')).toEqual([]);
  expect(sourceAccess).not.toHaveBeenCalled();
});

it('adds an empty derived catalog cache without rewriting version 41 rows or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 41
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 42
  )!;
  expect(target.records).toEqual({ ...source.records, sync_catalog_cache: [] });
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => name !== 'sync_catalog_cache')).toEqual(source.stores);
  expect(target.indexes).toEqual({ ...source.indexes, sync_catalog_cache: [] });
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 3 });
});

it('retains populated native and outgoing rows during version 41 cache admission', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 41
  )!;
  const rows = new Map<string, readonly unknown[]>(Object.entries(source.records));
  rows.set('sync_capture', [{ key: 'profile', retained: 'native profile and capture evidence' }]);
  rows.set('sync_outbox', [{ key: 'prepared', retained: 'dispatch and source evidence' }]);
  const before = structuredClone(rows);
  const sourceAccess = vi.fn(() => {
    throw new Error('Released rows must remain untouched.');
  });
  const db = {
    objectStoreNames: { contains: (name: string) => rows.has(name) },
    createObjectStore(name: string) {
      rows.set(name, []);
      return { createIndex: sourceAccess, put: sourceAccess };
    },
    deleteObjectStore: sourceAccess,
  };
  const tx = { abort: vi.fn(), objectStore: sourceAccess };
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 41)!;
  expect(migration.migrate(db, tx)).toBeUndefined();
  expect(migration.validate(db, tx)).toBeUndefined();
  expect(rows).toEqual(new Map([...before, ['sync_catalog_cache', []]]));
  expect(sourceAccess).not.toHaveBeenCalled();
});

it('admits queue control without changing version 42 stores, rows, history or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 42
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 43
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 4 });
  expect(DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 42)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [{ domainId: 'syncCapture', from: 3, to: 4 }],
    stores: ['sync_capture', 'sync_outbox', 'sync_catalog_cache'],
    toDatabaseVersion: 43,
  });
});

it('adds empty connection authority without changing version 43 source rows or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 43
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 44
  )!;
  expect(target.records).toEqual({ ...source.records, sync_connection: [] });
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => name !== 'sync_connection')).toEqual(source.stores);
  expect(target.indexes).toEqual({ ...source.indexes, sync_connection: [] });
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 5 });
  expect(DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 43)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [{ domainId: 'syncCapture', from: 4, to: 5 }],
    stores: ['sync_connection'],
    toDatabaseVersion: 44,
  });
});

it('adds only due indexing without rewriting version 44 rows or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 44
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 45
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual({ ...source.indexes, sync_outbox: ['syncQueueDue'] });
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 6 });
  expect(DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 44)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    domainVersions: [{ domainId: 'syncCapture', from: 5, to: 6 }],
    stores: ['sync_outbox'],
    toDatabaseVersion: 45,
  });
});

it('admits native text anchors without rewriting workspaces, history, recovery or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 46
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 47
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 32 });
  expect(DATABASE_MIGRATIONS.find((step) => step.toDatabaseVersion === 47)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    stores: ['video_workspaces', 'video_workspace_history', 'video_workspace_drafts'],
    domainVersions: [{ domainId: 'mediaLibrary', from: 31, to: 32 }],
  });
});

it('admits compact sync checkpoints without changing released rows, stores, indexes or immutable objects', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 48
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 49
  )!;
  expect(target).toBeDefined();
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 8 });
  expect(
    parseStoredSchemaContracts(
      Object.entries(source.domainVersions).map(([domainId, schemaVersion]) => ({
        domainId,
        schemaVersion,
      }))
    )
  ).toBeNull();
  expect(buildDatabaseMigrationPlan(49, 48)).toBeNull();
  expect(DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 48)).toMatchObject({
    backupCoverage: 'none',
    risk: 'additive',
    stores: ['sync_capture', 'sync_outbox', 'sync_connection'],
    domainVersions: [{ domainId: 'syncCapture', from: 7, to: 8 }],
    toDatabaseVersion: 49,
  });
});

it('adds shared protection without copying or rewriting version 49 credentials and source bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 49
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 50
  )!;
  expect(target.records).toEqual({ ...source.records, secret_protection: [] });
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => name !== 'secret_protection')).toEqual(source.stores);
  expect(target.indexes).toEqual({ ...source.indexes, secret_protection: [] });
  expect(target.domainVersions).toEqual({ ...source.domainVersions, secretProtection: 1 });
});

it('adds only metadata indexes to version 50 while retaining every source row and object digest', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find((row) => row.databaseVersion === 50)!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((row) => row.databaseVersion === 51)!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, syncCapture: 9 });
  const captureIndexes = source.indexes['sync_capture'];
  const outboxIndexes = source.indexes['sync_outbox'];
  if (!Array.isArray(captureIndexes) || !Array.isArray(outboxIndexes))
    throw new Error('Released version 50 sync index arrays are required.');
  expect(target.indexes).toEqual({
    ...source.indexes,
    sync_capture: [...captureIndexes, 'syncCaptureScopePhase', 'syncPendingScopeDue'],
    sync_outbox: [...outboxIndexes, 'syncQueueScopeStatus'],
  });
  expect(buildDatabaseMigrationPlan(51, 50)).toBeNull();
});

afterEach(() => vi.unstubAllGlobals());

it('admits audio processing contracts without rewriting projects, history or immutable source bytes', async () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 56
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find((fixture) => fixture.databaseVersion === 57);
  expect(target).toBeDefined();
  expect(target?.domainVersions).toEqual({
    ...source.domainVersions,
    mediaLibrary: 35,
    videoProjects: 12,
  });
  expect(target?.records).toEqual(source.records);
  expect(target?.opfsObjects).toEqual(source.opfsObjects);
  expect(target?.stores).toEqual(source.stores);
  expect(target?.indexes).toEqual(source.indexes);
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 56)!;
  expect(migration.toDatabaseVersion).toBe(57);
  expect(migration.risk).toBe('additive');
  const mutate = vi.fn();
  const database = {
    objectStoreNames: { contains: (name: string) => source.stores.some((store) => store === name) },
    createObjectStore: mutate,
    deleteObjectStore: mutate,
  };
  const transaction = { objectStore: mutate, abort: mutate };
  await migration.migrate(database, transaction);
  await migration.validate(database, transaction);
  expect(mutate).not.toHaveBeenCalled();
  expect(buildDatabaseMigrationPlan(57, 56)).toBeNull();
});

it('retains validated prototype preferences in migration quota estimates and refuses malformed rows', async () => {
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 54)!;
  const document = { id: 'one', sha256: 'a'.repeat(64), enabled: true };
  const row = {
    format: 'sniptale-animation-catalog',
    version: 1,
    packId: 'pack',
    enabled: true,
    documents: [document],
  };
  const source = (value: unknown) => ({
    transaction: () => ({
      store: {
        openCursor: async () => ({ value, primaryKey: 'pack', continue: async () => null }),
      },
    }),
  });
  expect(await migration.estimateAdditionalBytes()).toBe(65536);
  const expected = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: 'pack',
    enabled: true,
    documents: { one: { sourceSha256: document.sha256, enabled: true } },
  };
  expect(await migration.estimateAdditionalBytes(source(row))).toBe(
    65536 + new TextEncoder().encode(JSON.stringify(expected)).byteLength
  );
  const withPreferences = {
    ...row,
    documents: [{ ...document, presetPreferences: { density: 2 } }],
  };
  expect(await migration.estimateAdditionalBytes(source(withPreferences))).toBeGreaterThan(
    await migration.estimateAdditionalBytes(source(row))
  );
  const invalid: unknown[] = [
    null,
    { ...row, format: 'other' },
    { ...row, version: 2 },
    { ...row, packId: 1 },
    { ...row, packId: '../escape' },
    { ...row, enabled: 'yes' },
    { ...row, documents: null },
    { ...row, documents: [] },
    { ...row, documents: Array.from({ length: 101 }, () => document) },
    ...[
      null,
      { ...document, id: 1 },
      { ...document, id: '../escape' },
      { ...document, sha256: 1 },
      { ...document, sha256: 'invalid' },
      { ...document, enabled: 'yes' },
    ].map((item) => ({ ...row, documents: [item] })),
    { ...row, documents: [document, document] },
  ];
  for (const value of invalid)
    await expect(migration.estimateAdditionalBytes(source(value))).rejects.toThrow(
      'Invalid prototype'
    );
  expect(
    await migration.estimateAdditionalBytes({
      transaction() {
        throw new DOMException('Missing old store', 'NotFoundError');
      },
    })
  ).toBe(65536);
  await expect(
    migration.estimateAdditionalBytes({
      transaction() {
        throw new Error('Storage unavailable');
      },
    })
  ).rejects.toThrow('Storage unavailable');
});
it('refuses missing project stores before admitting the audio contract-only migration', () => {
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 56)!;
  const mutate = vi.fn();
  expect(() =>
    migration.validate(
      {
        objectStoreNames: { contains: () => false },
        createObjectStore: mutate,
        deleteObjectStore: mutate,
      },
      { objectStore: mutate, abort: mutate }
    )
  ).toThrow('Audio processing project stores');
  expect(mutate).not.toHaveBeenCalled();
});

it('adds freeze admission without rewriting or deleting any retained row or source object', async () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 58
  )!;
  const target = betaV59Fixture;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, mediaLibrary: 37 });
  const migration = DATABASE_MIGRATIONS.find((step) => step.fromDatabaseVersion === 58)!;
  expect(migration.toDatabaseVersion).toBe(59);
  expect(migration.risk).toBe('additive');
  expect(migration.backupCoverage).toBe('none');
  expect(await migration.estimateAdditionalBytes()).toBe(64 * 1024);
  const mutate = vi.fn(() => {
    throw new Error('Retained data must not be touched');
  });
  const database = {
    objectStoreNames: { contains: (name: string) => source.stores.some((store) => store === name) },
    createObjectStore: mutate,
    deleteObjectStore: mutate,
  };
  const transaction = { objectStore: mutate, abort: mutate };
  expect(migration.migrate(database, transaction)).toBeUndefined();
  await migration.validate(database, transaction);
  expect(mutate).not.toHaveBeenCalled();
  expect(buildDatabaseMigrationPlan(59, 58)).toBeNull();
  const { expectedDigest, ...input } = target;
  expect(createHash('sha256').update(canonicalize(input)).digest('hex')).toBe(expectedDigest);
});

it('admits retained raster documents without changing any released row, store, index or immutable object', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 59
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 60
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({
    ...source.domainVersions,
    mediaLibrary: 38,
    scenarioProjects: 11,
  });
});

it('adds the Scenario deletion fence without changing released content or immutable bytes', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 62
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 63
  )!;
  expect(target.records).toEqual({ ...source.records, scenario_project_revisions: [] });
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores.filter((name) => name !== 'scenario_project_revisions')).toEqual(
    source.stores
  );
  expect(target.indexes).toEqual({ ...source.indexes, scenario_project_revisions: [] });
  expect(target.domainVersions).toEqual({ ...source.domainVersions, scenarioProjects: 13 });
});

it('admits editing branch unit references without changing released Scenario data or files', () => {
  const source = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 63
  )!;
  const target = SUPPORTED_BETA_DATABASE_FIXTURES.find(
    (fixture) => fixture.databaseVersion === 64
  )!;
  expect(target.records).toEqual(source.records);
  expect(target.opfsObjects).toEqual(source.opfsObjects);
  expect(target.stores).toEqual(source.stores);
  expect(target.indexes).toEqual(source.indexes);
  expect(target.domainVersions).toEqual({ ...source.domainVersions, scenarioProjects: 14 });
});
