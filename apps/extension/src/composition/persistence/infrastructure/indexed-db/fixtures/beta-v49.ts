import { betaV48Fixture } from './beta-v48';

/** Compact checkpoint admission preserves all released rows and immutable objects. */
export const betaV49Fixture = {
  ...betaV48Fixture,
  databaseVersion: 49,
  expectedDigest: 'ef374918a19fdb5ec85b224cf764e1f526d668ce2f70b5953804718d243a6070',
  domainVersions: { ...betaV48Fixture.domainVersions, syncCapture: 8 },
} as const;
