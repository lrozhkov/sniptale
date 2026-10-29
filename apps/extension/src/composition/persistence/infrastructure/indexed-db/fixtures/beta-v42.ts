import { betaV41Fixture } from './beta-v41';

/** The advisory catalog cache adds an empty store and preserves released source data. */
export const betaV42Fixture = {
  ...betaV41Fixture,
  databaseVersion: 42,
  expectedDigest: '2e47ca01597aa7a5bead3172be9d2a90abac96b19846cb339e497519df62555b',
  domainVersions: { ...betaV41Fixture.domainVersions, syncCapture: 3 },
  stores: [
    ...betaV41Fixture.stores.slice(0, -1),
    'sync_catalog_cache',
    ...betaV41Fixture.stores.slice(-1),
  ],
  indexes: { ...betaV41Fixture.indexes, sync_catalog_cache: [] },
  records: { ...betaV41Fixture.records, sync_catalog_cache: [] },
} as const;
