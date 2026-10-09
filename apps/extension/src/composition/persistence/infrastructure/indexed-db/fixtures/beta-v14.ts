import { betaV13Fixture } from './beta-v13';

/** Independent text admission preserves previous rows and immutable media. */
export const betaV14Fixture = {
  ...betaV13Fixture,
  databaseVersion: 14,
  expectedDigest: '615d8d8b68abdcaf09703b8db0df6e77cf27bfbbb22ff2f19f84cd3d9bab8763',
  domainVersions: { ...betaV13Fixture.domainVersions, mediaLibrary: 13 },
} as const;
