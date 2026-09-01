const TOOL_SOURCES = new Map([
  ['ast-grep.mjs', 'tooling/qa/audits/ast-grep/ast-grep.mjs'],
  ['build-step.mjs', 'tooling/qa/composition/build/build-step.mjs'],
  ['codeql.mjs', 'tooling/qa/audits/codeql/codeql.mjs'],
  ['git', 'git'],
  ['gitleaks.mjs', 'tooling/qa/audits/gitleaks/gitleaks.mjs'],
  ['knip.mjs', 'tooling/qa/audits/knip/knip.mjs'],
  ['jscpd.mjs', 'tooling/qa/audits/jscpd/check.mjs'],
  ['licenses.mjs', 'tooling/qa/audits/licenses/licenses.mjs'],
  ['npm-audit-signatures.mjs', 'tooling/qa/audits/supply-chain/npm-audit-signatures.mjs'],
  ['npm-audit.mjs', 'tooling/qa/audits/supply-chain/npm-audit.mjs'],
  ['osv.mjs', 'tooling/qa/audits/osv/check.mjs'],
  ['package-dist.mjs', 'tooling/release/package/package-dist.mjs'],
  ['qa-scope.mjs', 'tooling/qa/composition/scope/qa-scope.mjs'],
  ['verify-advisory.mjs', 'tooling/qa/wrappers/advisory.mjs'],
  ['verify-ai-hygiene.mjs', 'tooling/qa/composition/quality/ai-hygiene.mjs'],
  [
    'verify-app-core-owners.mjs',
    'tooling/qa/guards/architecture/app-core/verify-app-core-owners.mjs',
  ],
  [
    'verify-architecture-guardrails.mjs',
    'tooling/qa/guards/architecture/architecture-guardrails/check.mjs',
  ],
  ['verify-audit.mjs', 'tooling/qa/audits/supply-chain/npm-audit.mjs'],
  ['verify-boundaries.mjs', 'tooling/qa/guards/architecture/verify-boundaries.mjs'],
  ['verify-boundary-casts.mjs', 'tooling/qa/guards/boundaries/boundary-casts/check.mjs'],
  ['verify-boundary-inputs.mjs', 'tooling/qa/guards/boundaries/boundary-inputs/check.mjs'],
  [
    'verify-browser-adapters.mjs',
    'tooling/qa/guards/boundaries/browser/browser-adapters/check.mjs',
  ],
  [
    'verify-config-policy.mjs',
    'tooling/qa/guards/product-contracts/config/config-policy/check.mjs',
  ],
  [
    'verify-extension-build-layout.mjs',
    'tooling/qa/guards/product-contracts/extension-build/verify-extension-build-layout.mjs',
  ],
  ['verify-cycles.mjs', 'tooling/qa/guards/architecture/verify-cycles.mjs'],
  ['verify-dead-exports.mjs', 'tooling/qa/guards/quality/dead-code/dead-exports/check.mjs'],
  ['verify-dependency-admission.mjs', 'tooling/qa/guards/security/verify-dependency-admission.mjs'],
  ['verify-design-system.mjs', 'tooling/qa/guards/product-contracts/verify-design-system.mjs'],
  [
    'verify-detached-controller-methods.mjs',
    'tooling/qa/guards/quality/detached-controller-methods/check.mjs',
  ],
  [
    'verify-diagnostic-sanitization.mjs',
    'tooling/qa/guards/security/verify-diagnostic-sanitization.mjs',
  ],
  [
    'verify-documentation-facts.mjs',
    'tooling/qa/policy/documentation/documentation-facts/documentation-facts.mjs',
  ],
  [
    'verify-domain-fixture-realism.mjs',
    'tooling/qa/guards/product-contracts/verify-domain-fixture-realism.mjs',
  ],
  [
    'verify-entrypoint-wiring.mjs',
    'tooling/qa/guards/product-contracts/entrypoints/verify-entrypoint-wiring.mjs',
  ],
  [
    'verify-fetch-ownership.mjs',
    'tooling/qa/guards/security/network/credential-ownership/check.mjs',
  ],
  [
    'verify-forwarding-module-drift.mjs',
    'tooling/qa/guards/architecture/forwarding-module-drift/check.mjs',
  ],
  [
    'verify-heavy-runtime-import-ownership.mjs',
    'tooling/qa/guards/architecture/imports/verify-heavy-runtime-import-ownership.mjs',
  ],
  ['verify-i18n.mjs', 'tooling/qa/guards/product-contracts/verify-i18n.mjs'],
  [
    'verify-instance-ownership.mjs',
    'tooling/qa/guards/architecture/ownership/instance-ownership/check.mjs',
  ],
  ['verify-line-length.mjs', 'tooling/qa/guards/quality/readability/line-length/check.mjs'],
  ['verify-logging.mjs', 'tooling/qa/composition/quality/logging-projection.mjs'],
  [
    'verify-manifest-integrity.mjs',
    'tooling/qa/guards/product-contracts/manifest-integrity/check.mjs',
  ],
  [
    'verify-manifest-permissions.mjs',
    'tooling/qa/guards/architecture/manifest-permissions/check.mjs',
  ],
  [
    'verify-manual-mock-export-parity.mjs',
    'tooling/qa/guards/quality/mocks/manual-export-parity/check.mjs',
  ],
  ['verify-messaging.mjs', 'tooling/qa/guards/boundaries/verify-messaging.mjs'],
  ['verify-naming.mjs', 'tooling/qa/guards/quality/naming/check.mjs'],
  [
    'verify-network-fetch-policy.mjs',
    'tooling/qa/guards/security/network/verify-network-fetch-policy.mjs',
  ],
  ['verify-npm-audit-signatures.mjs', 'tooling/qa/audits/supply-chain/npm-audit-signatures.mjs'],
  ['verify-oss-release-surface.mjs', 'tooling/qa/audits/licenses/oss-release-surface/check.mjs'],
  ['verify-oxfmt.mjs', 'tooling/qa/guards/quality/verify-oxfmt.mjs'],
  ['verify-oxlint.mjs', 'tooling/qa/guards/quality/verify-oxlint.mjs'],
  [
    'verify-package-boundaries.mjs',
    'tooling/qa/guards/product-contracts/package-boundaries/check.mjs',
  ],
  [
    'verify-parser-snapshot-purity.mjs',
    'tooling/qa/guards/product-contracts/verify-parser-snapshot-purity.mjs',
  ],
  ['verify-qa-controls.mjs', 'tooling/qa/composition/control-inventory/verify-qa-controls.mjs'],
  [
    'verify-read-path-side-effects.mjs',
    'tooling/qa/guards/lifecycle/read-path-side-effects/check.mjs',
  ],
  ['verify-root-scatter.mjs', 'tooling/qa/guards/quality/root-scatter/check.mjs'],
  ['verify-root-side-effects.mjs', 'tooling/qa/guards/quality/root-side-effects/check.mjs'],
  ['verify-runtime-topology.mjs', 'tooling/qa/guards/architecture/runtime-topology/check.mjs'],
  ['verify-secret-storage.mjs', 'tooling/qa/guards/security/verify-secret-storage.mjs'],
  [
    'verify-html-sanitizer-ownership.mjs',
    'tooling/qa/guards/security/html-sanitizer-ownership/check.mjs',
  ],
  ['verify-sensitive-retention.mjs', 'tooling/qa/guards/security/verify-sensitive-retention.mjs'],
  [
    'verify-shared-style-ownership.mjs',
    'tooling/qa/guards/product-contracts/verify-shared-style-ownership.mjs',
  ],
  ['verify-sonarjs.mjs', 'tooling/qa/guards/quality/sonarjs/check.mjs'],
  [
    'verify-persistence-ownership.mjs',
    'tooling/qa/guards/lifecycle/persistence-ownership/check.mjs',
  ],
  ['verify-structural-risk.mjs', 'tooling/qa/analysis/structural-risk/check.mjs'],
  [
    'verify-suppression-directives.mjs',
    'tooling/qa/guards/quality/verify-suppression-directives.mjs',
  ],
  ['verify-target-only-paths.mjs', 'tooling/qa/policy/targets/verify-target-only-paths.mjs'],
  ['verify-task-artifacts.mjs', 'tooling/qa/composition/closeout/verify-task-artifacts.mjs'],
  ['verify-test-coverage.mjs', 'tooling/qa/proof/coverage/test-coverage/check.mjs'],
  ['verify-typecheck.mjs', 'tooling/qa/proof/typecheck/execution/check.mjs'],
  [
    'verify-ui-automation-seams.mjs',
    'tooling/qa/guards/product-contracts/ui-automation/verify-ui-automation-seams.mjs',
  ],
  ['verify-unit-tests.mjs', 'tooling/qa/proof/unit/verify-unit-tests.mjs'],
  [
    'verify-zip-package-profile.mjs',
    'tooling/qa/guards/product-contracts/archive/verify-zip-package-profile.mjs',
  ],
]);

export function resolveQaToolSource(tool) {
  const source = TOOL_SOURCES.get(tool);
  if (!source) throw new Error(`QA tool source is not registered: ${tool}`);
  return source;
}
