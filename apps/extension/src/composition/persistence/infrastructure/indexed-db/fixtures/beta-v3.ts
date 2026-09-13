import { betaV2Fixture } from './beta-v2';

/** Additive tour admission preserves every prior store, object and reference guide byte. */
export const betaV3Fixture = {
  ...betaV2Fixture,
  databaseVersion: 3,
  expectedDigest: '3f1a27a95d46c875daa0e2a828036a409b41987aba77e735a2e035d784d8d510',
  domainVersions: { ...betaV2Fixture.domainVersions, scenarioProjects: 2 },
} as const;
