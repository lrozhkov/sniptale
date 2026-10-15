import { betaV5Fixture } from './beta-v5';

/** Watermark admission retains all existing workspaces, asset owners and immutable bytes. */
export const betaV6Fixture = {
  ...betaV5Fixture,
  databaseVersion: 6,
  expectedDigest: 'c33b032edbd885484a08a47c42508d3164894fadfd751ba69306cf1fd94d05a7',
  domainVersions: {
    ...betaV5Fixture.domainVersions,
    mediaLibrary: 5,
  },
} as const;
