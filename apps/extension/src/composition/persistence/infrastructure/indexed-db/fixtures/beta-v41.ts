import { betaV40Fixture } from './beta-v40';

/** Outgoing preparation adds an empty store and preserves released source data. */
export const betaV41Fixture = {
  ...betaV40Fixture,
  databaseVersion: 41,
  expectedDigest: 'd08751db83fa7a39b74c461b6be72c1dd066ef365647d22eec71340bd583370a',
  domainVersions: { ...betaV40Fixture.domainVersions, syncCapture: 2 },
  stores: [
    ...betaV40Fixture.stores.slice(0, -1),
    'sync_outbox',
    ...betaV40Fixture.stores.slice(-1),
  ],
  indexes: { ...betaV40Fixture.indexes, sync_outbox: [] },
  records: { ...betaV40Fixture.records, sync_outbox: [] },
} as const;
