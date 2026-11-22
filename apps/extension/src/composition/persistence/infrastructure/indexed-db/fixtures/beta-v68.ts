import { betaV67Fixture } from './beta-v67';

/** Admit 1000 transitions without rewriting released editor rows or binary resources. */
export const betaV68Fixture = {
  ...betaV67Fixture,
  databaseVersion: 68,
  expectedDigest: '0997faa2aa00ff3f0e423bd5129619c3ef1058e9b0235bd80d77080e915f43e5',
  domainVersions: {
    ...betaV67Fixture.domainVersions,
    mediaLibrary: 42,
    videoProjects: 16,
    scenarioProjects: 15,
  },
} as const;
