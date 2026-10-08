import { betaV6Fixture } from './beta-v6';

/** Presentation admission preserves released records and immutable media bytes. */
export const betaV7Fixture = {
  ...betaV6Fixture,
  databaseVersion: 7,
  expectedDigest: '37ba6fded5e82d9c8fef515cb408b61fdad57c443f558510322ba52020634a95',
  domainVersions: { ...betaV6Fixture.domainVersions, mediaLibrary: 6 },
} as const;
