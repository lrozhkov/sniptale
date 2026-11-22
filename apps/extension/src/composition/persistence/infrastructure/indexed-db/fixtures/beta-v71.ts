import { betaV70Fixture } from './beta-v70';

/** Native Quick Edit admission records are empty before a restore or retirement. */
export const betaV71Fixture = {
  ...betaV70Fixture,
  databaseVersion: 71,
  expectedDigest: 'be83a4b041d6815549c52cd64e93948562599a3c3d7cccef63e35c63a9b57dba',
  domainVersions: { ...betaV70Fixture.domainVersions, mediaLibrary: 45 },
  stores: [
    ...betaV70Fixture.stores.slice(0, betaV70Fixture.stores.indexOf('video_workspaces') + 1),
    'video_review_identities',
    ...betaV70Fixture.stores.slice(betaV70Fixture.stores.indexOf('video_workspaces') + 1),
  ],
  indexes: { ...betaV70Fixture.indexes, video_review_identities: [] },
  records: { ...betaV70Fixture.records, video_review_identities: [] },
} as const;
