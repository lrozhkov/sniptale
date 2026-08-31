export const OWNER_SCOPED_LIFECYCLE_PROOF = [
  {
    lane: 'audit',
    sourceFile: 'tooling/qa/audits/supply-chain/npm-audit.mjs',
    testFiles: ['tooling/qa/audits/supply-chain/npm-audit.test.ts'],
    tool: 'verify-audit.mjs',
  },
  {
    lane: 'build',
    sourceFile: 'tooling/qa/composition/build/build-step.mjs',
    testFiles: ['tooling/qa/composition/build/build-step.test.ts'],
    tool: 'build-step.mjs',
  },
  {
    lane: 'build',
    sourceFile: 'tooling/release/package/package-dist.mjs',
    testFiles: ['tooling/release/package/package-dist.test.ts'],
    tool: 'package-dist.mjs',
  },
  {
    lane: 'build',
    sourceFile: 'tooling/qa/guards/architecture/architecture-guardrails/check.mjs',
    testFiles: ['tooling/qa/guards/architecture/architecture-guardrails/check.test.ts'],
    tool: 'verify-architecture-guardrails.mjs',
  },
];

export const OWNER_SCOPED_LIFECYCLE_TOOLS = OWNER_SCOPED_LIFECYCLE_PROOF.map(
  ({ tool }) => tool
).sort();
