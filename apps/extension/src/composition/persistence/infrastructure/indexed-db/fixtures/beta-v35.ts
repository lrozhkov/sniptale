import { betaV34Fixture } from './beta-v34';

/** Private voice history admission preserves released rows and immutable media. */
export const betaV35Fixture = {
  ...betaV34Fixture,
  databaseVersion: 35,
  expectedDigest: 'edb11f3b6b8850f6bc70b0ef0cfb47c770b3e033b1d08e4a89beecbe031b6a19',
  domainVersions: { ...betaV34Fixture.domainVersions, voiceInputHistory: 1 },
  stores: [
    ...betaV34Fixture.stores.slice(0, -1),
    'voice_input_history',
    ...betaV34Fixture.stores.slice(-1),
  ],
  indexes: { ...betaV34Fixture.indexes, voice_input_history: [] },
} as const;
