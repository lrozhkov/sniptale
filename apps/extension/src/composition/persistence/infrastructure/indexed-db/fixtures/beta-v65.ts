import { betaV64Fixture } from './beta-v64';

/** Admit immutable Montage history without rewriting released rows or files. */
export const betaV65Fixture = {
  ...betaV64Fixture,
  databaseVersion: 65,
  expectedDigest: '932d94a1bfad51b864e32b5b0cc670db96da2a57d99da6e83a8eff766a817b84',
  domainVersions: { ...betaV64Fixture.domainVersions, videoProjects: 14 },
} as const;
