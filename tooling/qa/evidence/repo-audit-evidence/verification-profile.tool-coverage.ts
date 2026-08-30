import type { collectVerificationProfile } from './verification-profile.mjs';

type Verification = ReturnType<typeof collectVerificationProfile>['verification'];
type ToolCoverageEntry = Verification['toolCoverage'][number];

export const BASE_WRAPPER_TOOL_COVERAGE: ToolCoverageEntry[] = [
  {
    tool: 'verify-persistence-ownership.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'diff-scoped',
    focusedScope: 'always-run',
    manualOnly: false,
  },
  {
    tool: 'verify-dead-exports.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'repo-wide',
    focusedScope: 'always-run',
    manualOnly: false,
  },
  {
    tool: 'build-step.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'repo-wide',
    focusedScope: null,
    manualOnly: false,
  },
  {
    tool: 'verify-ui-automation-seams.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'diff-scoped',
    focusedScope: 'always-run',
    manualOnly: false,
  },
];

export const HYBRID_WRAPPER_TOOL_COVERAGE: ToolCoverageEntry[] = [
  {
    tool: 'verify-unit-tests.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'hybrid-scoped',
    focusedScope: 'always-run',
    manualOnly: false,
  },
  {
    tool: 'verify-runtime-topology.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'repo-wide',
    focusedScope: 'trigger-scoped',
    manualOnly: false,
  },
  {
    tool: 'verify-root-scatter.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'repo-wide',
    focusedScope: 'trigger-scoped',
    manualOnly: false,
  },
  {
    tool: 'verify-manifest-permissions.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'repo-wide',
    focusedScope: 'trigger-scoped',
    manualOnly: false,
  },
  {
    tool: 'verify-test-coverage.mjs',
    script: null,
    entryKind: 'wrapper-only',
    fullScope: 'hybrid-scoped',
    focusedScope: 'always-run',
    manualOnly: false,
  },
];

export const ADVISORY_TOOL_COVERAGE: ToolCoverageEntry[] = [] as const;
