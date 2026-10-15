import { betaV24Fixture } from './beta-v24';

/** Causal private-source deletion is additive; existing authority and bytes remain untouched. */
export const betaV25Fixture = {
  ...betaV24Fixture,
  databaseVersion: 25,
  expectedDigest: 'a0962b7298e1f4616a557dbc6b53ab1a4fceca461715c9def8efe54665a819bc',
  domainVersions: { ...betaV24Fixture.domainVersions, assetGraph: 2 },
} as const;
