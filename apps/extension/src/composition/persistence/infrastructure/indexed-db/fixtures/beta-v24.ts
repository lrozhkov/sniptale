import { betaV23Fixture } from './beta-v23';

/** Bounded history admission preserves legacy rows and all immutable source objects. */
export const betaV24Fixture = {
  ...betaV23Fixture,
  databaseVersion: 24,
  expectedDigest: '161f788f99e87d093e0db7d3667fd8374e0feb7693d2605aacb73cbad84d6ef0',
  domainVersions: { ...betaV23Fixture.domainVersions, mediaLibrary: 21, scenarioProjects: 7 },
} as const;
