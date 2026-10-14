import { betaV29Fixture } from './beta-v29';

/** Source crop admission preserves existing rows and immutable source objects. */
export const betaV30Fixture = {
  ...betaV29Fixture,
  databaseVersion: 30,
  expectedDigest: '4239583c5461307818f1549349978035c4b0cdb1ad1054719f6914d0104d2e4d',
  domainVersions: { ...betaV29Fixture.domainVersions, mediaLibrary: 25 },
} as const;
