import { betaV32Fixture } from './beta-v32';

/** Recovery admission preserves all released rows and immutable media. */
export const betaV33Fixture = {
  ...betaV32Fixture,
  databaseVersion: 33,
  expectedDigest: '11c178ad336f7acd023be36b425b51be7aa5173a5b5c1bd3f9b626f2d6059ffd',
  domainVersions: { ...betaV32Fixture.domainVersions, recordings: 3 },
  stores: [
    ...betaV32Fixture.stores.slice(0, 2),
    'recording_recovery_sessions',
    'recording_recovery_blocks',
    ...betaV32Fixture.stores.slice(2),
  ],
  indexes: {
    ...betaV32Fixture.indexes,
    recording_recovery_sessions: ['createdAt'],
    recording_recovery_blocks: ['id'],
  },
} as const;
