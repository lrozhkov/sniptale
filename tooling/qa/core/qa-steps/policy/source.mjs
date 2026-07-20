const TOOL_DIRECTORIES = [
  [
    new Set([
      'ast-grep.mjs',
      'codeql.mjs',
      'evidence.mjs',
      'gitleaks.mjs',
      'jscpd.mjs',
      'knip.mjs',
      'licenses.mjs',
      'npm-audit-signatures.mjs',
      'npm-audit.mjs',
      'osv.mjs',
      'semgrep.mjs',
    ]),
    'tooling/qa/audits',
  ],
  [
    new Set([
      'verify-dependency-admission.mjs',
      'verify-diagnostic-sanitization.mjs',
      'verify-fetch-ownership.mjs',
      'verify-secret-storage.mjs',
      'verify-security.mjs',
      'verify-sensitive-retention.mjs',
    ]),
    'tooling/qa/guards/security',
  ],
  [
    new Set([
      'verify-boundaries.mjs',
      'verify-cycles.mjs',
      'verify-manifest-permissions.mjs',
      'verify-runtime-topology.mjs',
    ]),
    'tooling/qa/guards/architecture',
  ],
  [
    new Set([
      'verify-line-length.mjs',
      'verify-manual-mock-export-parity.mjs',
      'verify-suppression-directives.mjs',
    ]),
    'tooling/qa/guards/quality',
  ],
];

const EXPLICIT_TOOL_SOURCES = new Map([
  ['git', 'git'],
  ['package-dist.mjs', 'tooling/release/package-dist.mjs'],
]);

export function resolveQaToolSource(tool) {
  const explicitSource = EXPLICIT_TOOL_SOURCES.get(tool);
  if (explicitSource) return explicitSource;
  for (const [tools, directory] of TOOL_DIRECTORIES) {
    if (tools.has(tool)) return `${directory}/${tool}`;
  }
  return `tooling/qa/core/${tool}`;
}
