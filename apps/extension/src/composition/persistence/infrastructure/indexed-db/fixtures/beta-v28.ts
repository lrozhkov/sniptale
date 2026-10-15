import { betaV27Fixture } from './beta-v27';

/** Camera policy admission preserves existing records and immutable source objects. */
export const betaV28Fixture = {
  ...betaV27Fixture,
  databaseVersion: 28,
  expectedDigest: '7aee05f88cc4eabb9b6ac0ee40ecc4266d270549919143897c6ab447543278d8',
  domainVersions: { ...betaV27Fixture.domainVersions, mediaLibrary: 23, videoProjects: 5 },
} as const;
