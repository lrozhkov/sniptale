import { betaV54Fixture } from './beta-v54';

/** Visual preferences are independent durable data; retained package and media bytes do not change. */
export const betaV55Fixture = {
  ...betaV54Fixture,
  databaseVersion: 55,
  expectedDigest: '1def705528817df7dfdfff7d6fedf2a9e5f9123b1a19a801af82921fcaf65cf2',
  domainVersions: { ...betaV54Fixture.domainVersions, effects: 3 },
  indexes: { ...betaV54Fixture.indexes, video_visual_preferences: [] },
  records: { ...betaV54Fixture.records, video_visual_preferences: [] },
  stores: betaV54Fixture.stores.flatMap((name) =>
    name === 'video_animation_packages' ? [name, 'video_visual_preferences'] : [name]
  ),
} as const;
