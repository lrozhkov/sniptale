import { describe, expect, it, vi } from 'vitest';
import type { BetaDatabaseFixtureContract } from './index';
import { inspectSupportedSourceDatabase } from './source-inspection';

const fixture = {
  databaseName: 'sniptale-db',
  databaseVersion: 1,
  domainVersions: { recordings: 1 },
  expectedDigest: 'fixture',
  indexes: { recordings: ['createdAt'], schema_contracts: [] },
  opfsObjects: [],
  records: {},
  stores: ['recordings', 'schema_contracts'],
} satisfies BetaDatabaseFixtureContract;

function createDatabase(
  options: {
    contracts?: unknown;
    indexes?: Readonly<Record<string, readonly string[]>>;
    stores?: readonly string[];
    version?: number;
  } = {}
): Parameters<typeof inspectSupportedSourceDatabase>[0] {
  return {
    getAll: vi.fn(async () =>
      Object.hasOwn(options, 'contracts')
        ? options.contracts
        : [{ domainId: 'recordings', schemaVersion: 1 }]
    ),
    objectStoreNames: options.stores ?? fixture.stores,
    transaction: vi.fn((storeName: string) => ({
      store: {
        indexNames:
          options.indexes?.[storeName] ??
          fixture.indexes[storeName as keyof typeof fixture.indexes] ??
          [],
      },
    })),
    version: options.version ?? 1,
  };
}

describe('released beta source inspection', () => {
  it('accepts only the exact fixture stores, indexes, and domain contracts', async () => {
    await expect(inspectSupportedSourceDatabase(createDatabase(), [fixture])).resolves.toEqual({
      databaseVersion: 1,
      status: 'ready',
    });
    await expect(
      inspectSupportedSourceDatabase(createDatabase({ version: 2 }), [fixture])
    ).resolves.toBeNull();
    await expect(
      inspectSupportedSourceDatabase(createDatabase({ stores: ['recordings'] }), [fixture])
    ).resolves.toMatchObject({ reason: 'stores', status: 'corrupt' });
    await expect(
      inspectSupportedSourceDatabase(
        createDatabase({ stores: [...fixture.stores, 'unexpected'] }),
        [fixture]
      )
    ).resolves.toMatchObject({ reason: 'stores', status: 'corrupt' });
    await expect(
      inspectSupportedSourceDatabase(
        createDatabase({ indexes: { recordings: [], schema_contracts: [] } }),
        [fixture]
      )
    ).resolves.toMatchObject({ reason: 'indexes', status: 'corrupt' });
    await expect(
      inspectSupportedSourceDatabase(
        createDatabase({
          indexes: { recordings: ['createdAt', 'unexpected'], schema_contracts: [] },
        }),
        [fixture]
      )
    ).resolves.toMatchObject({ reason: 'indexes', status: 'corrupt' });
  });

  it.each([
    null,
    [],
    [null],
    [{ domainId: 'recordings', schemaVersion: '1' }],
    [{ domainId: 'recordings', schemaVersion: 1.5 }],
    [
      { domainId: 'recordings', schemaVersion: 1 },
      { domainId: 'recordings', schemaVersion: 1 },
    ],
    [{ domainId: 'recordings', schemaVersion: 2 }],
  ])('rejects malformed or mismatched source contracts %#', async (contracts) => {
    await expect(
      inspectSupportedSourceDatabase(createDatabase({ contracts }), [fixture])
    ).resolves.toMatchObject({ reason: 'domain-contracts', status: 'corrupt' });
  });
});
