import { betaV21Fixture } from './beta-v21';

/** PCM profile admission preserves every existing workspace row and immutable object. */
export const betaV22Fixture = {
  ...betaV21Fixture,
  databaseVersion: 22,
  expectedDigest: 'e92bea5178f6dfa2d0c1ebb3fe42d25c87800bc6aef997e52696098411e97acc',
  domainVersions: { ...betaV21Fixture.domainVersions, mediaLibrary: 19 },
} as const;
