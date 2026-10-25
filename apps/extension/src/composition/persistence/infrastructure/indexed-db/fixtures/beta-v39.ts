import { betaV38Fixture } from './beta-v38';

/** Border origins and two-sided phases retain released project rows and media. */
export const betaV39Fixture = {
  ...betaV38Fixture,
  databaseVersion: 39,
  expectedDigest: 'b7c6a54feb81918b21d0dd0bf3f559621c6ddfe68f8f6904f1fb31bc37851dee',
  domainVersions: { ...betaV38Fixture.domainVersions, mediaLibrary: 31, videoProjects: 8 },
} as const;
