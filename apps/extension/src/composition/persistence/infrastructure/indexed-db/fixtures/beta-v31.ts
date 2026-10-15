import { betaV30Fixture } from './beta-v30';

/** Workspace color admission preserves existing projects and immutable media. */
export const betaV31Fixture = {
  ...betaV30Fixture,
  databaseVersion: 31,
  expectedDigest: '3aa97384cb7fb466bc1d95709409a567448a129ebbf54c6ad9b6a861f2ea88f8',
  domainVersions: { ...betaV30Fixture.domainVersions, mediaLibrary: 26 },
} as const;
