import { betaV13Fixture } from './beta-v13';
import { betaV12Fixture } from './beta-v12';
import { betaV11Fixture } from './beta-v11';
import { betaV10Fixture } from './beta-v10';
import { betaV9Fixture } from './beta-v9';
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
  betaV9Fixture,
  betaV10Fixture,
  betaV11Fixture,
  betaV12Fixture,
  betaV13Fixture,
];
