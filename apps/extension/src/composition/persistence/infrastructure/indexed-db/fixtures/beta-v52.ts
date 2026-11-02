import { betaV51Fixture } from './beta-v51';

/** Cursor stores preserve existing rows and immutable media after branch integration. */
export const betaV52Fixture = {
  ...betaV51Fixture,
  databaseVersion: 52,
  expectedDigest: '6c5611e479c108b87ca04b9e59e2ab5be9e33ec5f73e71b171371df93227247f',
  domainVersions: {
    ...betaV51Fixture.domainVersions,
    recordings: 5,
    assetGraph: 6,
    mediaLibrary: 34,
    scenarioProjects: 10,
    snapshots: 3,
    syncCapture: 10,
    videoProjects: 11,
  },
  indexes: {
    ...betaV51Fixture.indexes,
    recording_cursor_trajectories: ['recordingId', 'snapshotAssetId'],
    recording_cursor_blocks: ['trajectory', 'time'],
  },
  records: {
    ...betaV51Fixture.records,
    recording_cursor_trajectories: [],
    recording_cursor_blocks: [],
  },
  stores: [
    ...betaV51Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'recording_cursor_trajectories',
    'recording_cursor_blocks',
    'schema_contracts',
  ],
} as const;
