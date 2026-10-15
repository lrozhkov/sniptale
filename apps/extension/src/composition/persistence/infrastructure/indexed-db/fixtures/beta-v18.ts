import { betaV17Fixture } from './beta-v17';

/** Empty physical history admission retains all earlier media and workspace evidence. */
export const betaV18Fixture = {
  ...betaV17Fixture,
  databaseVersion: 18,
  expectedDigest: '9d31cfd6be6bdcaf59eaf6f2bc347c53e8299149a0b3c7dafc2ae3b05a96564b',
  domainVersions: { ...betaV17Fixture.domainVersions, mediaLibrary: 17 },
  stores: [
    ...betaV17Fixture.stores.slice(0, betaV17Fixture.stores.indexOf('video_workspace_drafts')),
    'video_workspace_history',
    ...betaV17Fixture.stores.slice(betaV17Fixture.stores.indexOf('video_workspace_drafts')),
  ],
  indexes: { ...betaV17Fixture.indexes, video_workspace_history: ['aggregateId'] },
  records: { ...betaV17Fixture.records, video_workspace_history: [] },
} as const;
