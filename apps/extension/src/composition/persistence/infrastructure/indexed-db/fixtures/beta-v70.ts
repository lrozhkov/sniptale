import { betaV69Fixture } from './beta-v69';

/** Admit native quick-edit generations without changing earlier project rows. */
export const betaV70Fixture = {
  ...betaV69Fixture,
  databaseVersion: 70,
  expectedDigest: '06ccc167169c6e7d4fa05bf2ca918166a1e325504e5697efece22f9e5d31407c',
  domainVersions: { ...betaV69Fixture.domainVersions, mediaLibrary: 44 },
} as const;
