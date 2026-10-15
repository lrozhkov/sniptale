import { betaV4Fixture } from './beta-v4';

/** Speech admission preserves existing workspace history and immutable asset objects. */
export const betaV5Fixture = {
  ...betaV4Fixture,
  databaseVersion: 5,
  expectedDigest: 'd1260b88c5fdc22b6a57abc92da713b8b0c50968d17ecb4ea393add5fac14013',
  domainVersions: {
    ...betaV4Fixture.domainVersions,
    mediaLibrary: 4,
  },
} as const;
