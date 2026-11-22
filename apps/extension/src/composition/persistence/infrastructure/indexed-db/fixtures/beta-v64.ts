import { betaV63Fixture } from './beta-v63';

/** Admit unit-backed editing branches without rewriting released records or files. */
export const betaV64Fixture = {
  ...betaV63Fixture,
  databaseVersion: 64,
  expectedDigest: '6e3323169772360e7bb3b6fdacb434f22985a30e14a7159740f464c0c5ffc430',
  domainVersions: { ...betaV63Fixture.domainVersions, scenarioProjects: 14 },
} as const;
