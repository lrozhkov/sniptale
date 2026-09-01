export const QA_CATEGORY_ORDER = Object.freeze({
  preparation: -1,
  'scope-and-admission': 0,
  'lexical-and-path': 1,
  'syntax-core': 2,
  'single-file-semantics': 3,
  'owner-state-and-diff-structure': 4,
  'dependency-graph': 5,
  'cross-artifact-closure': 6,
  'behavioral-proof': 7,
  'supply-chain-network': 8,
  'release-sast-and-legal': 9,
  'qa-meta-policy': 10,
  orchestration: 11,
  'audit-report': 12,
});

const CATEGORY_BY_LABEL = new Map([
  ['Format', 'preparation'],
  ['Task artifacts', 'scope-and-admission'],
  ['Changed-line readability', 'lexical-and-path'],
  ['Dead commented code', 'lexical-and-path'],
  ['Suppression directives', 'lexical-and-path'],
  ['Oxlint', 'syntax-core'],
  ['Boundary casts', 'syntax-core'],
  ['Root side effects', 'syntax-core'],
  ['Logging policy', 'syntax-core'],
  ['Boundary inputs', 'single-file-semantics'],
  ['Parser snapshot purity', 'single-file-semantics'],
  ['Detached controller methods', 'single-file-semantics'],
  ['Domain fixture realism', 'single-file-semantics'],
  ['Naming', 'owner-state-and-diff-structure'],
  ['Structural risk', 'owner-state-and-diff-structure'],
  ['Dependency boundaries', 'dependency-graph'],
  ['Cycles', 'dependency-graph'],
  ['Architecture guardrails', 'dependency-graph'],
  ['Audit', 'cross-artifact-closure'],
  ['HTML sanitizer ownership', 'single-file-semantics'],
  ['Mock export parity', 'cross-artifact-closure'],
  ['Dead exports', 'cross-artifact-closure'],
  ['Dependency admission', 'supply-chain-network'],
  ['Runtime parity', 'scope-and-admission'],
  ['Typecheck', 'behavioral-proof'],
  ['Unit tests', 'behavioral-proof'],
  ['Test coverage', 'behavioral-proof'],
  ['Full product coverage', 'behavioral-proof'],
  ['Build', 'behavioral-proof'],
  ['Release archive', 'behavioral-proof'],
  ['E2E build', 'behavioral-proof'],
  ['Playwright', 'behavioral-proof'],
  ['npm audit', 'supply-chain-network'],
  ['npm audit signatures', 'supply-chain-network'],
  ['OSV-Scanner', 'supply-chain-network'],
  ['Gitleaks', 'supply-chain-network'],
  ['License inventory', 'release-sast-and-legal'],
  ['ast-grep', 'release-sast-and-legal'],
  ['Knip', 'release-sast-and-legal'],
  ['jscpd', 'release-sast-and-legal'],
  ['CodeQL', 'release-sast-and-legal'],
  ['QA rule coverage contract', 'qa-meta-policy'],
  ['QA control inventory', 'qa-meta-policy'],
  ['Technical debt registry', 'qa-meta-policy'],
  ['Audit evidence report-only inventory', 'audit-report'],
  ['Topology report-only inventory', 'audit-report'],
  ['Advisory report', 'audit-report'],
]);

const ORCHESTRATION_LANES = new Set([
  'build-commit',
  'closeout',
  'ci-composition',
  'wrapper-lifecycle',
]);

export function resolveQaCategory({ label, lanes }) {
  const explicit = CATEGORY_BY_LABEL.get(label);
  if (explicit) return explicit;
  if (lanes.some((lane) => ORCHESTRATION_LANES.has(lane))) return 'orchestration';
  if (lanes.includes('e2e')) return 'behavioral-proof';
  if (lanes.includes('audit')) return 'release-sast-and-legal';
  if (lanes.includes('advisory') || lanes.includes('structural-audit')) return 'audit-report';
  if (lanes.includes('harness')) return 'qa-meta-policy';
  if (lanes.includes('release-direct') || lanes.includes('focused-direct')) {
    return 'cross-artifact-closure';
  }
  return 'owner-state-and-diff-structure';
}

export function resolveQaSemanticClass({ kind, category }) {
  if (category === 'orchestration') return 'wrapper / CI composition';
  if (category === 'audit-report') return 'audit/report projection';
  if (kind === 'guardrail') return 'semantic guard / analyzer';
  if (kind === 'manual') return 'manual semantic control';
  return 'proof/build/test/tool';
}

export function resolveQaScopeProfile({ lanes, category, label }) {
  if (label === 'Forwarding module drift') return 'candidate diff';
  if (category === 'release-sast-and-legal') return 'release-only';
  if (category === 'behavioral-proof') return 'artifact';
  if (lanes.includes('focused-triggered')) return 'triggered repo-wide';
  if (lanes.some((lane) => lane.startsWith('focused'))) return 'diff files';
  if (lanes.includes('release-guardrail') || lanes.includes('release-direct')) return 'repo-wide';
  return 'target closure';
}

export function resolveQaResourceProfile(category) {
  if (category === 'supply-chain-network') return 'network';
  if (category === 'release-sast-and-legal') return 'native-cpu-heavy';
  if (category === 'dependency-graph' || category === 'behavioral-proof') return 'cpu-heavy';
  return 'io-light';
}

const ENGINE_DECISION_BY_LABEL = new Map([
  [
    'Task artifacts',
    [
      'custom-retained',
      'Keep the custom staged-index admission guard: it compares the exact Git index with HEAD/object fallback, participates in pre-commit and qa:build staging, and blocks tasks/**; no admitted lint engine owns staged-index semantics.',
    ],
  ],
  [
    'Target-only paths',
    [
      'custom-retained',
      'Keep the repository topology guard for physical retired roots, stale references and ' +
        'required targets/docs; generic lint path matching does not prove required-target closure.',
    ],
  ],
  [
    'Messaging',
    [
      'ast-grep-unified',
      'Four syntax rules have exact engine fixtures; default-import baseline stays in the import-index adapter.',
    ],
  ],
  [
    'Browser adapters',
    [
      'ast-grep-unified',
      'Twenty-one syntax rules have exact engine fixtures; owner paths and retired-protocol text stay narrow adapters.',
    ],
  ],
  [
    'Logging policy',
    [
      'oxlint-native',
      'Native no-console is projected from the single Oxlint receipt with two exact tracing exemptions.',
    ],
  ],
  [
    'Entrypoint wiring',
    [
      'custom-retained',
      'Runtime-entrypoint inventory and retired-import closure remain coupled to the topology registry.',
    ],
  ],
  [
    'Parser snapshot purity',
    [
      'custom-retained',
      'Owner allowlists and aliased live-global access require fixture parity beyond a pure syntax pattern.',
    ],
  ],
  [
    'UI automation seams',
    [
      'custom-retained',
      'DOM-driver and timing-owner exemptions are semantic path policy, not a standalone call pattern.',
    ],
  ],
  [
    'Persistence ownership',
    [
      'custom-retained',
      'Direct browser-storage/IndexedDB entrypoints, singleton imports and coordinated ' +
        'whole-record mutations require AST plus exact owner-path policy.',
    ],
  ],
  [
    'Boundary casts',
    [
      'custom-retained',
      'Adjacent proof and exhaustiveness exceptions are not expressible by the syntax engine alone.',
    ],
  ],
  [
    'Boundary inputs',
    [
      'custom-retained',
      'Validator-before-use and binding shadow semantics require scope/control-flow context.',
    ],
  ],
  [
    'HTML sanitizer ownership',
    [
      'custom-retained',
      'Native Oxlint owns eval/new-function while sanitizer ownership still requires an exact residual seam.',
    ],
  ],
  [
    'Secret storage',
    [
      'custom-retained',
      'Enclosing function ownership and computed/spread secret fields lack exact ast-grep parity.',
    ],
  ],
  [
    'Sensitive retention',
    [
      'custom-retained',
      'Field taxonomy and cache-record counterexamples require the existing semantic residual.',
    ],
  ],
  [
    'Fetch ownership',
    [
      'custom-retained',
      'Config-variable, spread header and owner exemptions require association beyond a call pattern.',
    ],
  ],
  [
    'Network fetch policy',
    [
      'custom-retained',
      'Authorization evidence must be associated with each fetch; the old whole-file waiver must not be reproduced.',
    ],
  ],
  [
    'ZIP package profile',
    [
      'custom-retained',
      'Default-import binding plus a real canonical inflation-profile call must be related in one source file.',
    ],
  ],
  [
    'Root side effects',
    [
      'custom-retained',
      'Candidate facade discovery and metadata-rich allowances remain the admission authority around top-level syntax.',
    ],
  ],
]);

export function resolveQaEngineDecision({ engine, label }) {
  const [profile, rationale] = ENGINE_DECISION_BY_LABEL.get(label) ?? [
    engine,
    'Retain the current admitted engine until this control receives its own atomic parity decision.',
  ];
  return Object.freeze({ profile, rationale });
}
