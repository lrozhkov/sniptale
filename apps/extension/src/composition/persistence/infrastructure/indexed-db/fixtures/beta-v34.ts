import { betaV33Fixture } from './beta-v33';

/** Scenario framing admission preserves all released rows and immutable media. */
export const betaV34Fixture = {
  ...betaV33Fixture,
  databaseVersion: 34,
  expectedDigest: '37f40bffe384e78c6f19947f29b6956cb25a380270662047508bfb1f98abf04d',
  domainVersions: { ...betaV33Fixture.domainVersions, scenarioProjects: 8 },
} as const;
