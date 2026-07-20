import type { PolicyStateDescriptor } from './types';

export const stagedPolicyStateDescriptors = [
  {
    authorityFamily: 'popup-export-archive-download',
    failClosedOnRestart: true,
    id: 'popup-export-staged-archives',
    oneShot: false,
    ownerModule: 'apps/extension/src/background/capture/popup-export/staged-archives.ts',
    proofModules: ['apps/extension/src/background/capture/popup-export/staged-archives.test.ts'],
    requiresTtl: false,
    restartBehavior: 'In-flight archive chunks are transaction-bound and final save fails closed.',
    restartClass: 'transaction-bound',
    stateClass: 'staged-artifact',
    storageClass: 'memory-only',
  },
  {
    authorityFamily: 'recording-download-staged-chunks',
    failClosedOnRestart: true,
    id: 'recording-download-staged-chunks',
    oneShot: false,
    ownerModule:
      'apps/extension/src/background/capture/routing/recording-download/staged-recordings.ts',
    proofModules: [
      'apps/extension/src/background/capture/routing/recording-download/staged-recordings.test.ts',
    ],
    requiresTtl: false,
    restartBehavior: [
      'In-flight recording chunks are transaction-bound;',
      'final save fails closed when staging state is absent.',
    ].join(' '),
    restartClass: 'transaction-bound',
    stateClass: 'staged-artifact',
    storageClass: 'memory-only',
  },
  {
    authorityFamily: 'web-snapshot-save',
    failClosedOnRestart: true,
    id: 'web-snapshot-staged-blobs',
    oneShot: false,
    ownerModule: 'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.ts',
    proofModules: [
      'apps/extension/src/background/capture/routing/web-snapshot/staged-blobs.test.ts',
    ],
    requiresTtl: false,
    restartBehavior: 'In-flight chunks are transaction-bound; missing staged blobs fail fast.',
    restartClass: 'transaction-bound',
    stateClass: 'staged-artifact',
    storageClass: 'memory-only',
  },
] as const satisfies readonly PolicyStateDescriptor[];
