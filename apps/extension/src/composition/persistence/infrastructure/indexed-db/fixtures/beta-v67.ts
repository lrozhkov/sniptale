import { betaV66Fixture } from './beta-v66';

/** Admit packed Image metadata without rewriting released rows or binary resources. */
export const betaV67Fixture = {
  ...betaV66Fixture,
  databaseVersion: 67,
  expectedDigest: '6c06964952317ff396e9a247c47821407871821c65dee51f0296a4f48df3f9f1',
  domainVersions: { ...betaV66Fixture.domainVersions, mediaLibrary: 41 },
} as const;
