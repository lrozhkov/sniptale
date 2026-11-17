import { betaV65Fixture } from './beta-v65';

/** Admit inline Montage inverses without rewriting released rows or files. */
export const betaV66Fixture = {
  ...betaV65Fixture,
  databaseVersion: 66,
  expectedDigest: 'c2a9b2708f49eaf55055f953715c67453d8726da8cc31e231f91c668e8a0a33b',
  domainVersions: { ...betaV65Fixture.domainVersions, videoProjects: 15 },
} as const;
