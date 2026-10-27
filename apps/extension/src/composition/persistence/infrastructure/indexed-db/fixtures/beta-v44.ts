import { betaV43Fixture } from './beta-v43';

/** Connection admission adds empty authority without changing released rows or bytes. */
export const betaV44Fixture = {
  ...betaV43Fixture,
  databaseVersion: 44,
  expectedDigest: '4ffb600024102bd70787cfb0d86a94a94e6571ef0268033aaf056fe932509a18',
  domainVersions: { ...betaV43Fixture.domainVersions, syncCapture: 5 },
  indexes: { ...betaV43Fixture.indexes, sync_connection: [] },
  records: { ...betaV43Fixture.records, sync_connection: [] },
  stores: [
    ...betaV43Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'sync_connection',
    'schema_contracts',
  ],
} as const;
