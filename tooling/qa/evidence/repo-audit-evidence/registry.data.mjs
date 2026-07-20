export {
  FOCUSED_VIOLATION_STEP_TOOLS,
  FULL_VIOLATION_STEP_TOOLS,
} from '../../core/qa-steps/definitions.data.mjs';

export const ADVISORY_SCRIPT_IDS = new Set(['qa:advisory']);

export const HARNESS_GUARDRAIL_TOOLS = new Set(['verify-qa-rule-coverage-contract.mjs']);

export const REPO_AUDIT_REPORT_DEFINITIONS = [
  {
    tool: 'verify-interface-surfaces.mjs',
    commands: [
      'node tooling/qa/core/verify-interface-surfaces.mjs --repo-wide --report-only',
      'node tooling/qa/core/verify-interface-surfaces.mjs --report-return-bags --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-ui-automation-seams.mjs',
    commands: ['node tooling/qa/core/verify-ui-automation-seams.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-multi-message-transitions.mjs',
    commands: [
      'node tooling/qa/core/verify-multi-message-transitions.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-root-side-effects.mjs',
    commands: ['node tooling/qa/core/verify-root-side-effects.mjs --repo-wide --report-only'],
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
    tool: 'verify-detached-controller-methods.mjs',
    commands: [
      'node tooling/qa/core/verify-detached-controller-methods.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-detached-this-methods.mjs',
    mode: 'manual-audit-inventory',
    commands: ['node tooling/qa/core/verify-detached-this-methods.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-storage-write-patterns.mjs',
    commands: ['node tooling/qa/core/verify-storage-write-patterns.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-runtime-protocol-contracts.mjs',
    commands: [
      'node tooling/qa/core/verify-runtime-protocol-contracts.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-zip-package-profile.mjs',
    commands: ['node tooling/qa/core/verify-zip-package-profile.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-backup-import-atomicity.mjs',
    commands: ['node tooling/qa/core/verify-backup-import-atomicity.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-privacy-feature-settings.mjs',
    mode: 'manual-audit-inventory',
    commands: [
      'node tooling/qa/core/verify-privacy-feature-settings.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-contract-parser-coverage.mjs',
    commands: [
      'node tooling/qa/core/verify-contract-parser-coverage.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-resource-budget-consistency.mjs',
    commands: [
      'node tooling/qa/core/verify-resource-budget-consistency.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-resource-lifecycle-pairs.mjs',
    commands: [
      'node tooling/qa/core/verify-resource-lifecycle-pairs.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-state-machine-proof.mjs',
    commands: ['node tooling/qa/core/verify-state-machine-proof.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-hot-loop-work.mjs',
    commands: ['node tooling/qa/core/verify-hot-loop-work.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-stats-counter-semantics.mjs',
    mode: 'manual-audit-inventory',
    commands: ['node tooling/qa/core/verify-stats-counter-semantics.mjs --repo-wide --report-only'],
  },
  {
    tool: 'verify-history-detached-snapshots.mjs',
    commands: [
      'node tooling/qa/core/verify-history-detached-snapshots.mjs --repo-wide --report-only',
    ],
  },
  {
    tool: 'verify-hot-path-cleanups.mjs',
    mode: 'manual-audit-inventory',
    commands: ['node tooling/qa/core/verify-hot-path-cleanups.mjs --repo-wide --report-only'],
  },
  {
    tool: 'audits/ast-grep.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/knip.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/jscpd.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/semgrep.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/codeql.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'verify-npm-audit-signatures.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/osv.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/gitleaks.mjs',
    commands: ['npm run qa:audit'],
  },
  {
    tool: 'audits/licenses.mjs',
    commands: ['npm run qa:audit'],
  },
];
