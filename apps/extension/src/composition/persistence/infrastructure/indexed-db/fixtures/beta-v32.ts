import { betaV31Fixture } from './beta-v31';

/** Track control admission preserves existing projects and immutable media. */
export const betaV32Fixture = {
  ...betaV31Fixture,
  databaseVersion: 32,
  expectedDigest: 'b45fef482bfef11442870138421dfc7313d7f2a7e1584c716cbeee3a8b9ac545',
  domainVersions: { ...betaV31Fixture.domainVersions, mediaLibrary: 27 },
} as const;
