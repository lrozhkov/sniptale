import { betaV39Fixture } from './beta-v39';

/** Capture and native project revision admission retains released rows and immutable media. */
export const betaV40Fixture = {
  ...betaV39Fixture,
  databaseVersion: 40,
  expectedDigest: '0a76b683b29ce8017f1522e430a1e97b19a1d72c6c21845545ad96422c4ac964',
  domainVersions: { ...betaV39Fixture.domainVersions, syncCapture: 1, videoProjects: 9 },
  stores: [
    ...betaV39Fixture.stores.slice(0, 7),
    'video_project_revisions',
    ...betaV39Fixture.stores.slice(7, -1),
    'sync_capture',
    ...betaV39Fixture.stores.slice(-1),
  ],
  indexes: {
    ...betaV39Fixture.indexes,
    sync_capture: ['kind', 'rootKey', 'createdAt'],
    video_project_revisions: [],
  },
  records: { ...betaV39Fixture.records, sync_capture: [], video_project_revisions: [] },
} as const;
