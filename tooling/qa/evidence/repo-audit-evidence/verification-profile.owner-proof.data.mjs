export const OWNER_SCOPED_LIFECYCLE_PROOF = [
  {
    lane: 'audit',
    sourceFile: 'tooling/qa/core/verify-audit.mjs',
    testFiles: ['tooling/qa/core/verify-audit.test.ts'],
    tool: 'verify-audit.mjs',
  },
  {
    lane: 'build',
    sourceFile: 'tooling/qa/core/verify-build.mjs',
    testFiles: ['tooling/qa/core/verify-build.test.ts'],
    tool: 'verify-build.mjs',
  },
  {
    lane: 'build',
    sourceFile: 'tooling/release/package-dist.mjs',
    testFiles: ['tooling/release/package-dist.test.ts'],
    tool: 'package-dist.mjs',
  },
  {
    lane: 'build',
    sourceFile: 'tooling/qa/core/verify-architecture-guardrails.mjs',
    testFiles: ['tooling/qa/core/verify-architecture-guardrails.test.ts'],
    tool: 'verify-architecture-guardrails.mjs',
  },
];

export const OWNER_SCOPED_LIFECYCLE_TOOLS = OWNER_SCOPED_LIFECYCLE_PROOF.map(
  ({ tool }) => tool
).sort();
