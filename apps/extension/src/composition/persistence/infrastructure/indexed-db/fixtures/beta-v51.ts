import { betaV50Fixture } from './beta-v50';

/** Native key projections preserve all released source rows and object bytes. */
export const betaV51Fixture = {
  ...betaV50Fixture,
  databaseVersion: 51,
  expectedDigest: '2b3465427358b216b0e87a12f6d4ad2930826bb6268f7a45b70e3c683915bb20',
  domainVersions: { ...betaV50Fixture.domainVersions, syncCapture: 9 },
  indexes: {
    ...betaV50Fixture.indexes,
    sync_capture: [
      ...betaV50Fixture.indexes.sync_capture,
      'syncCaptureScopePhase',
      'syncPendingScopeDue',
    ],
    sync_outbox: [...betaV50Fixture.indexes.sync_outbox, 'syncQueueScopeStatus'],
  },
} as const;
