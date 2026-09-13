import { betaV3Fixture } from './beta-v3';
import { betaV1Fixture } from './beta-v1';
import { betaV2Fixture } from './beta-v2';

export interface BetaDatabaseFixtureContract {
  databaseName: string;
  databaseVersion: number;
  domainVersions: Readonly<Record<string, number>>;
  expectedDigest: string;
  indexes: Readonly<Record<string, readonly string[]>>;
  opfsObjects: readonly {
    assetId: string;
    text: string;
  }[];
  records: Readonly<Record<string, readonly unknown[]>>;
  stores: readonly string[];
}

export const SUPPORTED_BETA_DATABASE_FIXTURES: readonly BetaDatabaseFixtureContract[] = [
  betaV1Fixture,
  betaV2Fixture,
  betaV3Fixture,
];
