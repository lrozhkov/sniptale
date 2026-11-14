import { betaV59Fixture } from './beta-v59';

/** Integrated image admission preserves existing records and immutable source objects. */
export const betaV60Fixture = {
  ...betaV59Fixture,
  databaseVersion: 60,
  expectedDigest: '2ee458fc6eab2f59f30ca4a21a5c5934a4b2b92e9045828d32386d7d9027dde4',
  domainVersions: { ...betaV59Fixture.domainVersions, mediaLibrary: 38, scenarioProjects: 11 },
} as const;
