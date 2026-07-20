export const REPO_AUDIT_REPORT_DEFINITIONS = [
  {
    tool: 'verify-interface-surfaces.mjs',
    commands: [
      'node tooling/qa/core/verify-interface-surfaces.mjs --repo-wide --report-only',
      'node tooling/qa/core/verify-interface-surfaces.mjs --report-return-bags --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-read-path-side-effects.mjs',
    commands: ['node tooling/qa/core/verify-read-path-side-effects.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-read-safe-naming.mjs',
    commands: ['node tooling/qa/core/verify-read-safe-naming.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-lifecycle-intent.mjs',
    commands: ['node tooling/qa/core/verify-lifecycle-intent.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-success-failure-asymmetry.mjs',
    commands: [
      'node tooling/qa/core/verify-success-failure-asymmetry.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-destructive-async-swaps.mjs',
    commands: ['node tooling/qa/core/verify-destructive-async-swaps.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-storage-write-patterns.mjs',
    commands: ['node tooling/qa/core/verify-storage-write-patterns.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-history-detached-snapshots.mjs',
    commands: [
      'node tooling/qa/core/verify-history-detached-snapshots.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-hot-path-cleanups.mjs',
    commands: ['node tooling/qa/core/verify-hot-path-cleanups.mjs --repo-wide --report-only'],
  },
] as const;
