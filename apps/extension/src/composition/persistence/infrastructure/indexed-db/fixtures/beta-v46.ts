import { betaV45Fixture } from './beta-v45';

/** Residency adds empty metadata authority and preserves released content. */
export const betaV46Fixture = {
  ...betaV45Fixture,
  databaseVersion: 46,
  expectedDigest: 'a1668a430e626895651ec59cc7c180bcb5e53719524205bdf3975197011dd340',
  domainVersions: { ...betaV45Fixture.domainVersions, assetGraph: 4 },
  indexes: { ...betaV45Fixture.indexes, asset_residency: [] },
  records: { ...betaV45Fixture.records, asset_residency: [] },
  stores: [
    ...betaV45Fixture.stores.filter((name) => name !== 'schema_contracts'),
    'asset_residency',
    'schema_contracts',
  ],
} as const;
