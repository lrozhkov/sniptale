import { betaV46Fixture } from './beta-v46';

/** Native text timing admission preserves every released row and immutable object. */
export const betaV47Fixture = {
  ...betaV46Fixture,
  databaseVersion: 47,
  expectedDigest: 'd17da50baafeec8e8bc454d995131801217762e0b878bb77a58ae28bbabc4bdb',
  domainVersions: { ...betaV46Fixture.domainVersions, mediaLibrary: 32 },
} as const;
