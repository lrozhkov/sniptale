import { betaV7Fixture } from './beta-v7';

/** Original speech admission retains released records and immutable media bytes. */
export const betaV8Fixture = {
  ...betaV7Fixture,
  databaseVersion: 8,
  expectedDigest: '9b1aa3c7fcbecb0f7a7259161703a13cda7d160b4f5a9b6844716f2c89bf4f17',
  domainVersions: { ...betaV7Fixture.domainVersions, mediaLibrary: 7 },
} as const;
