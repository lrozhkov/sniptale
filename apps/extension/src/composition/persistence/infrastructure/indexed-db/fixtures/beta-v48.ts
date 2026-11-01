import { betaV47Fixture } from './beta-v47';

/** Event history adds an empty store and preserves released rows and immutable objects. */
export const betaV48Fixture = {
  ...betaV47Fixture,
  databaseVersion: 48,
  expectedDigest: '401c89cd4e9604dc243e7ecbc51b5fa421b1292767eafb5eed95de2e49b32b64',
  domainVersions: { ...betaV47Fixture.domainVersions, recordings: 5 },
  indexes: { ...betaV47Fixture.indexes, recording_events: ['kind', 'timeBuckets'] },
  records: { ...betaV47Fixture.records, recording_events: [] },
  stores: [
    ...betaV47Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'recording_events',
    'schema_contracts',
  ],
} as const;
