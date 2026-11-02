import { nativeAppV47Fixture } from './native-app-v47';

/** Event history adds an empty store and preserves released rows and immutable objects. */
export const nativeAppV48Fixture = {
  ...nativeAppV47Fixture,
  databaseVersion: 48,
  expectedDigest: '401c89cd4e9604dc243e7ecbc51b5fa421b1292767eafb5eed95de2e49b32b64',
  domainVersions: { ...nativeAppV47Fixture.domainVersions, recordings: 5 },
  indexes: { ...nativeAppV47Fixture.indexes, recording_events: ['kind', 'timeBuckets'] },
  records: { ...nativeAppV47Fixture.records, recording_events: [] },
  stores: [
    ...nativeAppV47Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'recording_events',
    'schema_contracts',
  ],
} as const;
