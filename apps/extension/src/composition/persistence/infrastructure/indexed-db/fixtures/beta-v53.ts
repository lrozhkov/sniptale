import { betaV52Fixture } from './beta-v52';

/** Event stores preserve existing rows and immutable media after branch integration. */
export const betaV53Fixture = {
  ...betaV52Fixture,
  databaseVersion: 53,
  expectedDigest: 'b5bb31e2680097bda7de39ef7e8bea057cb51396000df4361f4d370992fe3d43',
  domainVersions: { ...betaV52Fixture.domainVersions, recordings: 6 },
  indexes: {
    ...betaV52Fixture.indexes,
    recording_events: ['kind', 'timeBuckets', 'snapshotAssetId'],
  },
  records: { ...betaV52Fixture.records, recording_events: [] },
  stores: [
    ...betaV52Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'recording_events',
    'schema_contracts',
  ],
} as const;
