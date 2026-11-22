import { betaV71Fixture } from './beta-v71';

export const betaV72Fixture = {
  ...betaV71Fixture,
  databaseVersion: 72,
  expectedDigest: 'a811d78038ed0f26e353e60bbaa6b4f4c0da9a4f5054215107d8215679ae0538',
  domainVersions: { ...betaV71Fixture.domainVersions, mediaLibrary: 46, assetGraph: 7 },
} as const;
