import { betaV42Fixture } from './beta-v42';

/** Queue control admission preserves all released stores, rows and immutable bytes. */
export const betaV43Fixture = {
  ...betaV42Fixture,
  databaseVersion: 43,
  expectedDigest: '1578a6ff527a4c9a13c2969acfbe1a99599660cb441c498ef6f0e387ba408264',
  domainVersions: { ...betaV42Fixture.domainVersions, syncCapture: 4 },
} as const;
