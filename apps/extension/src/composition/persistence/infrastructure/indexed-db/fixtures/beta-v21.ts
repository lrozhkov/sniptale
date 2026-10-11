import { betaV20Fixture } from './beta-v20';

/** Annotation admission retains all released rows, history and immutable media. */
export const betaV21Fixture = {
  ...betaV20Fixture,
  databaseVersion: 21,
  expectedDigest: 'e6dd588962c51c9c83d3ce4b204bf140ee192434d735a5d854ac2c24cf0ae918',
  domainVersions: { ...betaV20Fixture.domainVersions, mediaLibrary: 18 },
} as const;
