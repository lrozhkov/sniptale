import { betaV53Fixture } from './beta-v53';

/** New animation packages have their own store. Legacy rows and media remain unchanged. */
export const betaV54Fixture = {
  ...betaV53Fixture,
  databaseVersion: 54,
  expectedDigest: 'f10f64d9fe78ea0707af112b530cc9cadc7fbea1a206bc26eafc21f9ff34332c',
  domainVersions: { ...betaV53Fixture.domainVersions, effects: 2 },
  indexes: { ...betaV53Fixture.indexes, video_animation_packages: ['enabled', 'updatedAt'] },
  records: { ...betaV53Fixture.records, video_animation_packages: [] },
  stores: [
    ...betaV53Fixture.stores.flatMap((name) =>
      name === 'video_effect_bundles' ? [name, 'video_animation_packages'] : [name]
    ),
  ],
} as const;
