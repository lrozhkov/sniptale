import { betaV10Fixture } from './beta-v10';

/** Independent presentation controls retain all prior source records and bytes. */
export const betaV11Fixture = {
  ...betaV10Fixture,
  databaseVersion: 11,
  expectedDigest: '67be9a6f984c6650f15d4a91fda749e40ea1e5810819884d461f3d3d6e8677a3',
  domainVersions: { ...betaV10Fixture.domainVersions, mediaLibrary: 10 },
} as const;
