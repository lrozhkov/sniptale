export const RELEASE_DIRECT_STEPS = [
  ['format', 'Format', 'verify-oxfmt.mjs'],
  ['changed-line-readability', 'Changed-line readability', 'verify-line-length.mjs'],
  ['repository-readability', 'Repository readability', 'verify-line-length.mjs'],
  ['oxlint', 'Oxlint', 'verify-oxlint.mjs'],
  ['dead-commented-code', 'Dead commented code', 'verify-dead-commented-code.mjs'],
  ['structural-risk', 'Structural risk', 'verify-structural-risk.mjs'],
  ['naming', 'Naming', 'verify-naming.mjs'],
  ['i18n', 'i18n', 'verify-i18n.mjs'],
  ['design-system', 'Design system', 'verify-design-system.mjs'],
  ['html-sanitizer-ownership', 'HTML sanitizer ownership', 'verify-html-sanitizer-ownership.mjs'],
  ['dependency-boundaries', 'Dependency boundaries', 'verify-boundaries.mjs'],
  ['cycles', 'Cycles', 'verify-cycles.mjs'],
  ['typecheck', 'Typecheck', 'verify-typecheck.mjs'],
  ['dead-exports', 'Dead exports', 'verify-dead-exports.mjs'],
  ['mock-export-parity', 'Mock export parity', 'verify-manual-mock-export-parity.mjs'],
  ['unit-tests', 'Unit tests', 'verify-unit-tests.mjs'],
  ['harness-unit-tests', 'Harness unit tests', 'verify-unit-tests.mjs'],
  ['test-coverage', 'Test coverage', 'verify-test-coverage.mjs'],
  ['build', 'Build', 'build-step.mjs'],
  ['release-archive', 'Release archive', 'package-dist.mjs'],
];

export const FOCUSED_DIRECT_STEPS = [
  ['format', 'Format', 'verify-oxfmt.mjs'],
  ['oxlint', 'Oxlint', 'verify-oxlint.mjs'],
  ['changed-line-readability', 'Changed-line readability', 'verify-line-length.mjs'],
  ['dead-commented-code', 'Dead commented code', 'verify-dead-commented-code.mjs'],
  ['structural-risk', 'Structural risk', 'verify-structural-risk.mjs'],
  ['mock-export-parity', 'Mock export parity', 'verify-manual-mock-export-parity.mjs'],
  ['html-sanitizer-ownership', 'HTML sanitizer ownership', 'verify-html-sanitizer-ownership.mjs'],
  ['dead-exports', 'Dead exports', 'verify-dead-exports.mjs'],
  ['unit-tests', 'Unit tests', 'verify-unit-tests.mjs'],
  ['test-coverage', 'Test coverage', 'verify-test-coverage.mjs'],
];

export const FOCUSED_TRIGGERED_RUNTIME_STEPS = [
  ['config-policy', 'Config policy', 'verify-config-policy.mjs', 'conditional'],
  [
    'extension-build-layout',
    'Extension build layout',
    'verify-extension-build-layout.mjs',
    'conditional',
  ],
];

export const FOCUSED_CODE_VIOLATION_LABELS = Object.freeze([
  'Boundary casts',
  'Boundary inputs',
  'ZIP package profile',
  'Domain fixture realism',
  'Network fetch policy',
  'Entrypoint wiring',
  'Logging policy',
  'Suppression directives',
  'Browser adapters',
  'Read path side effects',
  'Persistence ownership',
  'Detached controller methods',
  'Parser snapshot purity',
  'Naming',
  'Forwarding module drift',
  'UI automation seams',
  'Interactive controller ownership',
]);

export const FOCUSED_TRIGGERED_CONTROLS = Object.freeze([
  ['Documentation facts', 'verify-documentation-facts.mjs'],
  ['Runtime topology', 'verify-runtime-topology.mjs'],
  ['Manifest permissions', 'verify-manifest-permissions.mjs'],
  ['Config policy', 'verify-config-policy.mjs'],
  ['Extension build layout', 'verify-extension-build-layout.mjs'],
  ['Dependency admission', 'verify-dependency-admission.mjs'],
  ['Secret storage', 'verify-secret-storage.mjs'],
  ['Sensitive retention', 'verify-sensitive-retention.mjs'],
  ['Fetch ownership', 'verify-fetch-ownership.mjs'],
  ['Diagnostic sanitization', 'verify-diagnostic-sanitization.mjs'],
  ['Manifest integrity', 'verify-manifest-integrity.mjs'],
  ['Root side effects', 'verify-root-side-effects.mjs'],
  ['Package boundaries', 'verify-package-boundaries.mjs'],
  ['App-core owners', 'verify-app-core-owners.mjs'],
  ['Target-only paths', 'verify-target-only-paths.mjs'],
  ['OSS release surface', 'verify-oss-release-surface.mjs'],
  ['Shared style ownership', 'verify-shared-style-ownership.mjs'],
  ['i18n', 'verify-i18n.mjs'],
  ['Design system', 'verify-design-system.mjs'],
  ['Dependency boundaries', 'verify-boundaries.mjs'],
  ['Cycles', 'verify-cycles.mjs'],
  ['Typecheck', 'verify-typecheck.mjs'],
]);

export const HARNESS_STEPS = [
  ['format', 'Format', 'verify-oxfmt.mjs', 'always'],
  ['qa-composition-integrity', 'QA composition integrity', 'verify-qa-controls.mjs', 'always'],
  [
    'dependency-admission',
    'Dependency admission',
    'verify-dependency-admission.mjs',
    'conditional',
  ],
  ['typecheck', 'Typecheck', 'verify-typecheck.mjs', 'conditional'],
  ['oxlint', 'Oxlint', 'verify-oxlint.mjs', 'always'],
  ['unit-tests', 'Unit tests', 'verify-unit-tests.mjs', 'conditional'],
];

export const BUILD_STEPS = [['build', 'Build', 'build-step.mjs']];

export const BUILD_COMMIT_STEPS = [
  ['stage-changes', 'Stage changes', 'git', 'conditional'],
  ['task-artifacts', 'Task artifacts', 'verify-task-artifacts.mjs', 'conditional'],
  [
    'pre-commit-diff-guard',
    'Pre-commit diff guard',
    'build.commit-steps.mjs',
    'conditional',
    'tooling/qa/wrappers/build/execution/commit-steps.mjs',
  ],
  ['git-commit', 'Git commit', 'git', 'conditional'],
];

export const CLOSEOUT_STEPS = [
  [
    'qa-checkpoint',
    'QA checkpoint',
    'checkpoint.mjs',
    'conditional',
    'tooling/qa/wrappers/checkpoint.mjs',
  ],
  ['full-build', 'Full build', 'build.mjs', 'conditional', 'tooling/qa/wrappers/build.mjs'],
];

export const CANONICAL_WRAPPER_IDS = Object.freeze([
  'qa:preflight',
  'qa:structural-audit',
  'qa:checkpoint',
  'qa:closeout',
  'qa:build',
  'qa:release-harness',
  'ci:proof',
  'ci:release',
  'qa:e2e',
]);

export const CI_COMPOSITION_STEPS = [
  [
    'runtime-parity',
    'Runtime parity',
    'runtime-parity.mjs',
    'always',
    'tooling/ci/runtime-parity.mjs',
    ['ci:proof', 'ci:release'],
  ],
  [
    'candidate-proof-admission',
    'Candidate proof admission',
    'admit-candidate-proof.mjs',
    'conditional',
    'tooling/ci/admit-candidate-proof.mjs',
  ],
  [
    'fast-proof-reuse',
    'Fast proof reuse',
    'fast-proof-reuse.mjs',
    'conditional',
    'tooling/ci/fast-proof-reuse.mjs',
  ],
  [
    'main-proof-transport',
    'Main proof transport',
    'main-proof-transport.mjs',
    'conditional',
    'tooling/ci/main-proof-transport.mjs',
  ],
  [
    'production-build',
    'Production build',
    'qa-composition.mjs',
    'always',
    'tooling/ci/qa-composition.mjs',
    ['ci:proof', 'ci:release'],
  ],
  [
    'main-proof-verification',
    'Main proof verification',
    'verify-main-proof.mjs',
    'conditional',
    'tooling/ci/verify-main-proof.mjs',
  ],
];

export const WRAPPER_LIFECYCLE_STEPS = [
  [
    'wrapper-lifecycle',
    'Wrapper lifecycle',
    'run-controller.mjs',
    'conditional',
    'tooling/qa/runtime/observability/run-controller.mjs',
    CANONICAL_WRAPPER_IDS,
  ],
  [
    'wrapper-interruption',
    'Wrapper interruption',
    'run-controller.mjs',
    'conditional',
    'tooling/qa/runtime/observability/run-controller.mjs',
    CANONICAL_WRAPPER_IDS,
  ],
  [
    'wrapper-stale-run-recovery',
    'Wrapper stale-run recovery',
    'maintenance.mjs',
    'conditional',
    'tooling/qa/runtime/observability/maintenance.mjs',
    CANONICAL_WRAPPER_IDS,
  ],
  [
    'qa-preflight',
    'QA preflight',
    'preflight.mjs',
    'always',
    'tooling/qa/wrappers/preflight.mjs',
    ['qa:preflight'],
  ],
  [
    'qa-checkpoint',
    'QA checkpoint',
    'checkpoint.mjs',
    'conditional',
    'tooling/qa/wrappers/checkpoint.mjs',
    ['qa:closeout'],
  ],
  [
    'qa-build',
    'QA build',
    'build.mjs',
    'conditional',
    'tooling/qa/wrappers/build.mjs',
    ['qa:build'],
  ],
  [
    'qa-release-harness',
    'QA release harness',
    'release-harness.mjs',
    'conditional',
    'tooling/qa/wrappers/release-harness.mjs',
    ['qa:release-harness'],
  ],
  [
    'harness-qa',
    'Harness QA',
    'verify-harness.state.helpers.mjs',
    'conditional',
    'tooling/qa/composition/harness/harness-freshness-step.mjs',
    ['qa:checkpoint'],
  ],
  [
    'wrapper-help',
    'Wrapper help',
    'cli-contracts.mjs',
    'conditional',
    'tooling/qa/wrappers/contracts/cli-contracts.mjs',
    CANONICAL_WRAPPER_IDS,
  ],
  [
    'no-applicable-targets',
    'No applicable targets',
    'qa-scope.mjs',
    'conditional',
    'tooling/qa/composition/scope/qa-scope.mjs',
    CANONICAL_WRAPPER_IDS,
  ],
];

export const E2E_STEPS = [
  ['e2e-build', 'E2E build', 'vite', 'always', 'tooling/test/e2e/run-e2e.mjs'],
  ['playwright', 'Playwright', 'playwright', 'always', 'tooling/test/e2e/run-e2e.mjs'],
];

export const ADVISORY_STEPS = [
  ['advisory-report', 'Advisory report', 'verify-advisory.mjs', 'advisory'],
];

export const STRUCTURAL_AUDIT_STEPS = [
  [
    'structural-audit',
    'Structural audit',
    'verify-structural-risk.mjs',
    'manual',
    'tooling/qa/wrappers/structural-audit.mjs',
    ['qa:structural-audit'],
  ],
];

export const AUDIT_STEPS = [
  ['full-product-coverage', 'Full product coverage', 'verify-test-coverage.mjs'],
  ['npm-audit', 'npm audit', 'npm-audit.mjs'],
  ['npm-audit-signatures', 'npm audit signatures', 'npm-audit-signatures.mjs'],
  ['osv-scanner', 'OSV-Scanner', 'osv.mjs'],
  ['gitleaks', 'Gitleaks', 'gitleaks.mjs'],
  ['license-inventory', 'License inventory', 'licenses.mjs'],
  ['ast-grep', 'ast-grep', 'ast-grep.mjs'],
  ['knip', 'Knip', 'knip.mjs'],
  ['jscpd', 'jscpd', 'jscpd.mjs'],
  ['codeql', 'CodeQL', 'codeql.mjs'],
];

export const FULL_VIOLATION_STEP_TOOLS = new Map([
  ['Architecture guardrails', 'verify-architecture-guardrails.mjs'],
  ['Boundary casts', 'verify-boundary-casts.mjs'],
  ['Boundary inputs', 'verify-boundary-inputs.mjs'],
  ['ZIP package profile', 'verify-zip-package-profile.mjs'],
  ['Network fetch policy', 'verify-network-fetch-policy.mjs'],
  ['Entrypoint wiring', 'verify-entrypoint-wiring.mjs'],
  ['Logging policy', 'verify-logging.mjs'],
  ['Config policy', 'verify-config-policy.mjs'],
  ['Extension build layout', 'verify-extension-build-layout.mjs'],
  ['Dependency admission', 'verify-dependency-admission.mjs'],
  ['Secret storage', 'verify-secret-storage.mjs'],
  ['Sensitive retention', 'verify-sensitive-retention.mjs'],
  ['Fetch ownership', 'verify-fetch-ownership.mjs'],
  ['Diagnostic sanitization', 'verify-diagnostic-sanitization.mjs'],
  ['Suppression directives', 'verify-suppression-directives.mjs'],
  ['Messaging', 'verify-messaging.mjs'],
  ['Forwarding module drift', 'verify-forwarding-module-drift.mjs'],
  ['Read path side effects', 'verify-read-path-side-effects.mjs'],
  ['Persistence ownership', 'verify-persistence-ownership.mjs'],
  ['Parser snapshot purity', 'verify-parser-snapshot-purity.mjs'],
  ['Documentation facts', 'verify-documentation-facts.mjs'],
  ['Manifest integrity', 'verify-manifest-integrity.mjs'],
  ['Manifest permissions', 'verify-manifest-permissions.mjs'],
  ['Runtime topology', 'verify-runtime-topology.mjs'],
  ['Package boundaries', 'verify-package-boundaries.mjs'],
  ['App-core owners', 'verify-app-core-owners.mjs'],
  ['Target-only paths', 'verify-target-only-paths.mjs'],
  ['OSS release surface', 'verify-oss-release-surface.mjs'],
  ['Browser adapters', 'verify-browser-adapters.mjs'],
  ['Root side effects', 'verify-root-side-effects.mjs'],
  ['Shared style ownership', 'verify-shared-style-ownership.mjs'],
  ['UI automation seams', 'verify-ui-automation-seams.mjs'],
  ['Interactive controller ownership', 'verify-instance-ownership.mjs'],
  ['Detached controller methods', 'verify-detached-controller-methods.mjs'],
  ['Domain fixture realism', 'verify-domain-fixture-realism.mjs'],
]);

export const FOCUSED_VIOLATION_STEP_TOOLS = new Map([
  ...FULL_VIOLATION_STEP_TOOLS,
  ['Detached controller methods', 'verify-detached-controller-methods.mjs'],
  ['Domain fixture realism', 'verify-domain-fixture-realism.mjs'],
  ['Naming', 'verify-naming.mjs'],
]);
