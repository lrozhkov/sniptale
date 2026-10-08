import { betaV9Fixture } from './beta-v9';

/** Additive join settings retain all prior source, workspace and native index data. */
export const betaV10Fixture = {
  ...betaV9Fixture,
  databaseVersion: 10,
  expectedDigest: 'f7b878a48a3d11bde71091bdfb114ce8fd9a3297b1daf0334c246e22a21ad8b1',
  domainVersions: { ...betaV9Fixture.domainVersions, mediaLibrary: 9 },
} as const;
