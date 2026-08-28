import type { PolicyStateDescriptor } from './types';

export const stagedPolicyStateDescriptors = [
  {
    authorityFamily: 'frame-annotation-raster-export',
    failClosedOnRestart: true,
    id: 'frame-annotation-raster-jobs',
    oneShot: true,
    ownerModule: 'apps/extension/src/composition/persistence/frame-annotation-raster-jobs/index.ts',
    proofModules: [
      'apps/extension/src/composition/persistence/frame-annotation-raster-jobs/index.test.ts',
      'apps/extension/src/background/frame-annotation-raster/route.test.ts',
    ],
    requiresTtl: true,
    restartBehavior: [
      'Worker restart invalidates the correlated in-memory lease and fails the active request closed;',
      'offscreen startup clears staged jobs, while expiry and cancellation bound abandoned IndexedDB payloads.',
    ].join(' '),
    restartClass: 'disposable-fail-closed',
    stateClass: 'staged-artifact',
    storageClass: 'indexed-db',
    ttlMs: 60 * 60 * 1_000,
  },
] as const satisfies readonly PolicyStateDescriptor[];
