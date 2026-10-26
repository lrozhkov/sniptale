import { betaV37Fixture } from './beta-v37';

/** Camera shadow directions retain released project rows and immutable media. */
export const betaV38Fixture = {
  ...betaV37Fixture,
  databaseVersion: 38,
  expectedDigest: 'cdf1150488236b22f4a74b0f52665a075d432d69c2544368a7a6932e77a8d4a2',
  domainVersions: { ...betaV37Fixture.domainVersions, mediaLibrary: 30, videoProjects: 7 },
} as const;
