import { betaV57Fixture } from './beta-v57';

/** Spatial focus admission preserves every project, history entry and source object. */
export const betaV58Fixture = {
  ...betaV57Fixture,
  databaseVersion: 58,
  expectedDigest: '5e008f66471ad8c458c0172ac094e993b0f83f6a526b13ef42f8ceed9f5740be',
  domainVersions: { ...betaV57Fixture.domainVersions, mediaLibrary: 36, videoProjects: 13 },
} as const;
