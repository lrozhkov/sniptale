import { betaV22Fixture } from './beta-v22';

/** Bundled action-sound admission preserves all released rows and immutable objects. */
export const betaV23Fixture = {
  ...betaV22Fixture,
  databaseVersion: 23,
  expectedDigest: 'fd3a6240c1e37ec26a504962c0c43ed249739cc1ebe0e31bddbd789a8adf7266',
  domainVersions: { ...betaV22Fixture.domainVersions, mediaLibrary: 20 },
} as const;
