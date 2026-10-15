import { betaV16Fixture } from './beta-v16';

/** Compact source gain admission preserves all prior workspace and immutable media rows. */
export const betaV17Fixture = {
  ...betaV16Fixture,
  databaseVersion: 17,
  expectedDigest: 'be18277af58eacef5c50c3750b59146652dd6c906edcee0930175899cff87330',
  domainVersions: { ...betaV16Fixture.domainVersions, mediaLibrary: 16 },
} as const;
