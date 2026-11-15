import { betaV56Fixture } from './beta-v56';

/** Audio processing admission changes contracts without rewriting project or source data. */
export const betaV57Fixture = {
  ...betaV56Fixture,
  databaseVersion: 57,
  expectedDigest: 'cf2af72faa874a36989d1d8685d081aabeaab448734d1607345808243a4409fd',
  domainVersions: { ...betaV56Fixture.domainVersions, mediaLibrary: 35, videoProjects: 12 },
} as const;
