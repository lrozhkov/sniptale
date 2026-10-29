import { betaV44Fixture } from './beta-v44';

/** Due indexing preserves released queue rows and immutable bytes. */
export const betaV45Fixture = {
  ...betaV44Fixture,
  databaseVersion: 45,
  expectedDigest: 'b158ac5436173a872846b4b4896184b342f107901be814752005bfd877ae96e5',
  domainVersions: { ...betaV44Fixture.domainVersions, syncCapture: 6 },
  indexes: { ...betaV44Fixture.indexes, sync_outbox: ['syncQueueDue'] },
} as const;
