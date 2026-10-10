import { betaV15Fixture } from './beta-v15';

/** Text provenance admission leaves all prior media, workspace and history rows intact. */
export const betaV16Fixture = {
  ...betaV15Fixture,
  databaseVersion: 16,
  expectedDigest: 'ae574201b6e90c4a0cca67add65124f5bf92b19e0937b475b9f1692e96328aaa',
  domainVersions: { ...betaV15Fixture.domainVersions, mediaLibrary: 15 },
} as const;
