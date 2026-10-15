import { betaV12Fixture } from './beta-v12';

/** Window zoom admission preserves previous authored framing and all immutable objects. */
export const betaV13Fixture = {
  ...betaV12Fixture,
  databaseVersion: 13,
  expectedDigest: '825c52f7131d28683eaa812a37eb2be52089be31db1fa9c5fc4b2e68e08da482',
  domainVersions: { ...betaV12Fixture.domainVersions, mediaLibrary: 12 },
} as const;
