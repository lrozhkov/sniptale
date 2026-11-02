import { betaV49Fixture } from './beta-v49';

/** Shared protection adds empty native authority without copying credentials. */
export const betaV50Fixture = {
  ...betaV49Fixture,
  databaseVersion: 50,
  expectedDigest: '835356fc99c5afce54193eac849a2e1b85edd8a672ade1294aae857b0e6b091a',
  domainVersions: { ...betaV49Fixture.domainVersions, secretProtection: 1 },
  stores: [...betaV49Fixture.stores.slice(0, -1), 'secret_protection', 'schema_contracts'],
  indexes: { ...betaV49Fixture.indexes, secret_protection: [] },
  records: { ...betaV49Fixture.records, secret_protection: [] },
} as const;
