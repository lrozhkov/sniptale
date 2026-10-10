import { betaV14Fixture } from './beta-v14';

/** Source attenuation admission preserves prior media and workspace rows. */
export const betaV15Fixture = {
  ...betaV14Fixture,
  databaseVersion: 15,
  expectedDigest: 'ecb5988cabe519db2dbc849a1bbfe651086984dc1bd456a021d897bba9d7ed5f',
  domainVersions: { ...betaV14Fixture.domainVersions, mediaLibrary: 14 },
} as const;
