import { betaV53Fixture } from './beta-v53';

/** Raster admission preserves every released row and immutable object. */
export const betaV54Fixture = {
  ...betaV53Fixture,
  databaseVersion: 54,
  expectedDigest: '0ab238ca6b886f5be505f1d12ba21606beefabb488ea4dafa192ea3357a86cfa',
  domainVersions: { ...betaV53Fixture.domainVersions, mediaLibrary: 35, scenarioProjects: 11 },
} as const;
