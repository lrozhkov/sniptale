import { betaV58Fixture } from './beta-v58';

/** Freeze-frame admission changes the media contract without changing retained content. */
export const betaV59Fixture = {
  ...betaV58Fixture,
  databaseVersion: 59,
  expectedDigest: 'cf57c29df77c3450fe78fcf53f97607426db48dcd6859ba8fd5898934d85edca',
  domainVersions: { ...betaV58Fixture.domainVersions, mediaLibrary: 37 },
} as const;
