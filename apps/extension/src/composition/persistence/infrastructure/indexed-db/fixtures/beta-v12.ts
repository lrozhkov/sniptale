import { betaV11Fixture } from './beta-v11';

/** Scene appearance admission preserves the existing workspace and immutable media graph. */
export const betaV12Fixture = {
  ...betaV11Fixture,
  databaseVersion: 12,
  expectedDigest: '27b16bef08ad7195721dd87cd34fe5b5f4349bbfe4bee8d1a1daaa38e07835f7',
  domainVersions: { ...betaV11Fixture.domainVersions, mediaLibrary: 11 },
} as const;
