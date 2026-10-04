import { betaV3Fixture } from './beta-v3';

/** Trash admission adds optional root lifecycle metadata without rewriting durable data. */
export const betaV4Fixture = {
  ...betaV3Fixture,
  databaseVersion: 4,
  expectedDigest: 'e4b3d8a0606ebb7c9276e880427616cec33f4d0406b912cd7c5c8154c53403dd',
  domainVersions: {
    ...betaV3Fixture.domainVersions,
    mediaLibrary: 3,
    scenarioProjects: 3,
    videoProjects: 2,
  },
} as const;
