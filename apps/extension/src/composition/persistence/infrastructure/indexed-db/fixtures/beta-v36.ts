import { betaV35Fixture } from './beta-v35';

/** Independent quick projects retain all released workspace and source data. */
export const betaV36Fixture = {
  ...betaV35Fixture,
  databaseVersion: 36,
  expectedDigest: 'ff1598c355e4774e4bb0327ce88d541b1b2b47c4bb1497967bf7fba986c59ca3',
  domainVersions: { ...betaV35Fixture.domainVersions, mediaLibrary: 28 },
} as const;
