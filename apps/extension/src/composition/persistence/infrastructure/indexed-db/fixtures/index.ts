import { betaV8Fixture } from './beta-v8';
import { betaV7Fixture } from './beta-v7';
import { betaV6Fixture } from './beta-v6';
import { betaV5Fixture } from './beta-v5';
import { betaV4Fixture } from './beta-v4';
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
  betaV4Fixture,
  betaV5Fixture,
  betaV6Fixture,
  betaV7Fixture,
  betaV8Fixture,
];
