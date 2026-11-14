import { betaV55Fixture } from './beta-v55';

/** Immutable GL preset resources add one store; previous rows and source bytes do not change. */
export const betaV56Fixture = {
  ...betaV55Fixture,
  databaseVersion: 56,
  expectedDigest: '40de045da5e16eb3e350fec222b73907db14fb3b504da68b69f3a6fea07ced3a',
  domainVersions: { ...betaV55Fixture.domainVersions, effects: 4 },
  indexes: { ...betaV55Fixture.indexes, video_gl_transition_presets: ['updatedAt'] },
  records: { ...betaV55Fixture.records, video_gl_transition_presets: [] },
  stores: betaV55Fixture.stores.flatMap((name) =>
    name === 'video_visual_preferences' ? [name, 'video_gl_transition_presets'] : [name]
  ),
} as const;
