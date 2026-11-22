import { betaV68Fixture } from './beta-v68';

/** Separate raster history admission without rewriting project rows or immutable files. */
export const betaV69Fixture = {
  ...betaV68Fixture,
  databaseVersion: 69,
  expectedDigest: '2c597757c22e821b9829c1645f208c460b34331a9c74453f7e9a13e553d42d17',
  domainVersions: { ...betaV68Fixture.domainVersions, mediaLibrary: 43 },
} as const;
