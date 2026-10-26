import { betaV36Fixture } from './beta-v36';

/** Camera screen behavior retains released project rows and immutable media. */
export const betaV37Fixture = {
  ...betaV36Fixture,
  databaseVersion: 37,
  expectedDigest: '8c94dd26f74ca394ad6ef3f34f2713a0d0c61a0722ae28a60a3a42258bf27556',
  domainVersions: { ...betaV36Fixture.domainVersions, mediaLibrary: 29, videoProjects: 6 },
} as const;
