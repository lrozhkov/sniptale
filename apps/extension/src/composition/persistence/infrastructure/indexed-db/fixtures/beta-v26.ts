import { betaV25Fixture } from './beta-v25';

/** Known-source ready claims preserve all released rows and immutable object bytes. */
export const betaV26Fixture = {
  ...betaV25Fixture,
  databaseVersion: 26,
  expectedDigest: '3a005b1c8a515422db5b27e1771d39ab439372d8afcb6bf502a7aef72c7af4d1',
  domainVersions: { ...betaV25Fixture.domainVersions, assetGraph: 3 },
} as const;
