import { betaV28Fixture } from './beta-v28';

/** Project metadata admission preserves released rows, history and source objects. */
export const betaV29Fixture = {
  ...betaV28Fixture,
  databaseVersion: 29,
  expectedDigest: '6989af3841b24edc35c6012287f3b9f444978bdfe7323e6a52d456f091b24aba',
  domainVersions: { ...betaV28Fixture.domainVersions, mediaLibrary: 24 },
} as const;
