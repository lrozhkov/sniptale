export const ADVISORY_SCRIPT_IDS = new Set(['qa:advisory']);
export const STRUCTURAL_AUDIT_SCRIPT_IDS = new Set(['qa:structural-audit']);

export const REPO_AUDIT_REPORT_DEFINITIONS = [
  {
    controlId: 'qa.rule.ui-automation-seams',
    tool: 'verify-ui-automation-seams.mjs',
    commands: [
      'node tooling/qa/guards/product-contracts/ui-automation/verify-ui-automation-seams.mjs --repo-wide --report-only',
    ],
  },
  {
    controlId: 'qa.rule.root-side-effects',
    tool: 'verify-root-side-effects.mjs',
    commands: [
      'node tooling/qa/guards/quality/root-side-effects/check.mjs --repo-wide --report-only',
    ],
  },
  {
    controlId: 'qa.rule.read-path-side-effects',
    tool: 'verify-read-path-side-effects.mjs',
    commands: [
      'node tooling/qa/guards/lifecycle/read-path-side-effects/check.mjs --repo-wide --report-only',
    ],
  },
  {
    controlId: 'qa.rule.detached-controller-methods',
    tool: 'verify-detached-controller-methods.mjs',
    commands: [
      'node tooling/qa/guards/quality/detached-controller-methods/check.mjs --repo-wide --report-only',
    ],
  },
  {
    controlId: 'qa.rule.persistence-ownership',
    tool: 'verify-persistence-ownership.mjs',
    commands: [
      'node tooling/qa/guards/lifecycle/persistence-ownership/check.mjs --repo-wide --report-only',
    ],
  },
  {
    controlId: 'qa.rule.zip-package-profile',
    tool: 'verify-zip-package-profile.mjs',
    commands: [
      'node tooling/qa/guards/product-contracts/archive/verify-zip-package-profile.mjs --repo-wide --report-only',
    ],
  },
  {
    controlId: 'qa.rule.ast-grep',
    tool: 'audits/ast-grep.mjs',
    commands: ['npm run ci:release'],
  },
  {
    controlId: 'qa.rule.knip',
    tool: 'audits/knip.mjs',
    commands: ['npm run ci:release'],
  },
  {
    controlId: 'qa.rule.jscpd',
    tool: 'audits/jscpd.mjs',
    commands: ['npm run ci:release'],
  },
  {
    controlId: 'qa.rule.codeql',
    tool: 'audits/codeql.mjs',
    commands: ['npm run ci:release'],
  },
  {
    catalogTool: 'npm-audit-signatures.mjs',
    controlId: 'qa.rule.npm-audit-signatures',
    tool: 'verify-npm-audit-signatures.mjs',
    commands: ['npm run ci:release'],
  },
  {
    controlId: 'qa.rule.osv-scanner',
    tool: 'audits/osv.mjs',
    commands: ['npm run ci:release'],
  },
  {
    controlId: 'qa.rule.gitleaks',
    tool: 'audits/gitleaks.mjs',
    commands: ['npm run ci:release'],
  },
  {
    controlId: 'qa.rule.license-inventory',
    tool: 'audits/licenses.mjs',
    commands: ['npm run ci:release'],
  },
];
