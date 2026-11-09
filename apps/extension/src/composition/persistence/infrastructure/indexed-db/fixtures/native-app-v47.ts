import { betaV46Fixture } from './beta-v46';

/** Cursor blocks add empty stores and preserve released rows and immutable objects. */
export const nativeAppV47Fixture = {
  ...betaV46Fixture,
  databaseVersion: 47,
  expectedDigest: 'a5bb1a1a3738d0a3b2290718a38882107a6d75f96ebcaf8bb7fff8e427bfc06b',
  domainVersions: { ...betaV46Fixture.domainVersions, recordings: 4 },
  indexes: {
    ...betaV46Fixture.indexes,
    recording_cursor_trajectories: ['recordingId'],
    recording_cursor_blocks: ['trajectory', 'time'],
  },
  records: {
    ...betaV46Fixture.records,
    recording_cursor_trajectories: [],
    recording_cursor_blocks: [],
  },
  stores: [
    ...betaV46Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'recording_cursor_trajectories',
    'recording_cursor_blocks',
    'schema_contracts',
  ],
} as const;
