import { betaV68Fixture } from './beta-v68';
import { betaV69Fixture } from './beta-v69';
import { betaV70Fixture } from './beta-v70';
import { betaV67Fixture } from './beta-v67';
import { betaV66Fixture } from './beta-v66';
import { betaV64Fixture } from './beta-v64';
import { betaV65Fixture } from './beta-v65';
import { betaV63Fixture } from './beta-v63';
import { betaV61Fixture } from './beta-v61';
import { betaV62Fixture } from './beta-v62';
import { betaV60Fixture } from './beta-v60';
import { betaV59Fixture } from './beta-v59';
import { betaV58Fixture } from './beta-v58';
import { betaV57Fixture } from './beta-v57';
import { betaV56Fixture } from './beta-v56';
import { betaV55Fixture } from './beta-v55';
import { betaV54Fixture } from './beta-v54';
import { betaV53Fixture } from './beta-v53';
import { betaV52Fixture } from './beta-v52';
import { betaV51Fixture } from './beta-v51';
import { betaV50Fixture } from './beta-v50';
import { betaV49Fixture } from './beta-v49';
import { betaV48Fixture } from './beta-v48';
import { betaV47Fixture } from './beta-v47';
import { betaV46Fixture } from './beta-v46';
import { betaV45Fixture } from './beta-v45';
import { betaV44Fixture } from './beta-v44';
import { betaV43Fixture } from './beta-v43';
import { betaV42Fixture } from './beta-v42';
import { betaV41Fixture } from './beta-v41';
import { betaV40Fixture } from './beta-v40';
import { betaV39Fixture } from './beta-v39';
import { betaV38Fixture } from './beta-v38';
import { betaV37Fixture } from './beta-v37';
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
  betaV37Fixture,
  betaV38Fixture,
  betaV39Fixture,
  betaV40Fixture,
  betaV41Fixture,
  betaV42Fixture,
  betaV43Fixture,
  betaV44Fixture,
  betaV45Fixture,
  betaV46Fixture,
  betaV47Fixture,
  betaV48Fixture,
  betaV49Fixture,
  betaV50Fixture,
  betaV51Fixture,
  betaV52Fixture,
  betaV53Fixture,
  betaV54Fixture,
  betaV55Fixture,
  betaV56Fixture,
  betaV57Fixture,
  betaV58Fixture,
  betaV59Fixture,
  betaV60Fixture,
  betaV61Fixture,
  betaV62Fixture,
  betaV63Fixture,
  betaV64Fixture,
  betaV65Fixture,
  betaV66Fixture,
  betaV67Fixture,
  betaV68Fixture,
  betaV69Fixture,
  betaV70Fixture,
];
