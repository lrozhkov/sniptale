import { betaV26Fixture } from './beta-v26';

/** Interaction authoring admission preserves every released row and immutable object. */
export const betaV27Fixture = {
  ...betaV26Fixture,
  databaseVersion: 27,
  expectedDigest: 'c92c3308914d3d8db4a0813fca8486377dfd2badad02fdb825e86fcabce26b7c',
  domainVersions: {
    ...betaV26Fixture.domainVersions,
    recordings: 2,
    mediaLibrary: 22,
    videoProjects: 4,
  },
} as const;
