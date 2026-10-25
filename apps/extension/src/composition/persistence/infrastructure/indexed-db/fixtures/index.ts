import { betaV36Fixture } from './beta-v36';
import { betaV35Fixture } from './beta-v35';
import { betaV34Fixture } from './beta-v34';
import { betaV33Fixture } from './beta-v33';
import { betaV32Fixture } from './beta-v32';
import { betaV31Fixture } from './beta-v31';
import { betaV30Fixture } from './beta-v30';
import { betaV29Fixture } from './beta-v29';
import { betaV28Fixture } from './beta-v28';
import { betaV27Fixture } from './beta-v27';
import { betaV23Fixture } from './beta-v23';
import { betaV24Fixture } from './beta-v24';
import { betaV25Fixture } from './beta-v25';
import { betaV26Fixture } from './beta-v26';
import { betaV22Fixture } from './beta-v22';
import { betaV21Fixture } from './beta-v21';
import { betaV20Fixture } from './beta-v20';
import { betaV19Fixture } from './beta-v19';
import { betaV18Fixture } from './beta-v18';
import { betaV17Fixture } from './beta-v17';
import { betaV16Fixture } from './beta-v16';
import { betaV15Fixture } from './beta-v15';
import { betaV14Fixture } from './beta-v14';
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
  betaV14Fixture,
  betaV15Fixture,
  betaV16Fixture,
  betaV17Fixture,
  betaV18Fixture,
  betaV19Fixture,
  betaV20Fixture,
  betaV21Fixture,
  betaV22Fixture,
  betaV23Fixture,
  betaV24Fixture,
  betaV25Fixture,
  betaV26Fixture,
  betaV27Fixture,
  betaV28Fixture,
  betaV29Fixture,
  betaV30Fixture,
  betaV31Fixture,
  betaV32Fixture,
  betaV33Fixture,
  betaV34Fixture,
  betaV35Fixture,
  betaV36Fixture,
];
