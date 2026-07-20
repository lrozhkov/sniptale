import { QA_LABELS_BY_DOMAIN } from './domain-labels.mjs';

const DOMAIN_POLICY = {
  architecture: {
    owner: 'architecture-boundaries',
    expectedNoise: 'low',
    truthSource: 'repo topology data, owner contracts, and executable boundary collectors',
    ruleDoc: 'docs/architecture/code-organization.md',
    remediation: [
      'Inspect the owning boundary and dependency direction, then fix the implementation',
      'or the narrow machine policy that owns the exception.',
    ].join(' '),
  },
  lifecycle: {
    owner: 'seam-lifecycle',
    expectedNoise: 'medium',
    truthSource: 'semantic seam collectors and owner-local contract proof',
    ruleDoc: 'docs/engineering/implementation-rules.md#state-persistence-and-async-safety',
    remediation: [
      'Inspect state authority, failure symmetry, rollback, and stale-result ownership',
      'in the reported seam before changing a guard threshold.',
    ].join(' '),
  },
  maintainability: {
    owner: 'maintainability-governance',
    expectedNoise: 'medium',
    truthSource: 'changed-code metrics, topology heuristics, and owner policy data',
    ruleDoc: 'docs/engineering/implementation-rules.md#code-shape',
    remediation: [
      'Inspect the owner boundary, public contract, and expected growth path;',
      'do not mechanically split code only to clear a metric.',
    ].join(' '),
  },
  qa: {
    owner: 'qa-platform',
    expectedNoise: 'low',
    truthSource: 'executable wrapper step and deterministic tool output',
    ruleDoc: 'docs/tooling/code-quality.md',
    remediation: [
      'Use the reported tool, scope, and owner-local proof to correct the defect;',
      'do not skip or weaken the canonical QA lane.',
    ].join(' '),
  },
  security: {
    owner: 'security-governance',
    expectedNoise: 'low',
    truthSource: 'security policy data, boundary collectors, and tool output',
    ruleDoc: 'docs/security/data-handling.md',
    remediation: [
      'Trace the reported boundary to its canonical security owner and fix the data or authority flow;',
      'never add a broad allowlist.',
    ].join(' '),
  },
};

const SPECIAL_POLICY = {
  'Retired controls': {
    owner: 'architecture-boundaries',
    expectedNoise: 'low',
    truthSource: 'tracked current-tree retirement and replacement policy',
    ruleDoc: 'docs/architecture/code-organization.md',
    remediation: [
      'Remove the reported retired authority or route the behavior through the current',
      'architecture, release, or legal owner; do not restore superseded controls.',
    ].join(' '),
  },
  'QA control inventory': {
    owner: 'qa-platform',
    expectedNoise: 'low',
    truthSource:
      'executable QA definitions, discovered entrypoints, policy consumers, and fixture proof',
    ruleDoc: 'docs/tooling/code-quality.md',
    remediation: [
      'Classify the reported control, executable, script, or policy in the tracked control',
      'disposition file and add owner-local negative proof; do not add an implicit default.',
    ].join(' '),
  },
  'Technical debt registry': {
    owner: 'maintainability-governance',
    expectedNoise: 'low',
    truthSource: 'typed owner debt registry joined to exact live baseline and coverage detectors',
    ruleDoc: 'docs/engineering/tech-debt-report.md',
    remediation: [
      'Inspect the owner boundary and live detector, then burn down or explicitly disposition',
      'the exact record; do not mechanically split code or widen a baseline.',
    ].join(' '),
  },
};

export function resolveQaDomainPolicy(label) {
  if (SPECIAL_POLICY[label]) return SPECIAL_POLICY[label];
  for (const domain of ['security', 'architecture', 'lifecycle', 'maintainability']) {
    if (QA_LABELS_BY_DOMAIN[domain].has(label)) return DOMAIN_POLICY[domain];
  }
  return DOMAIN_POLICY.qa;
}
