import fs from 'node:fs';

import { expect, it } from 'vitest';
import {
  FOCUSED_DIRECT_WRAPPER_STEPS,
  FULL_DIRECT_WRAPPER_STEPS,
} from '../evidence/repo-audit-evidence/registry.mjs';

const VERIFY_ALL_VIOLATION_STEP_ORDER = [
  'Hotspot regression',
  'Architecture guardrails',
  'Boundary casts',
  'Boundary inputs',
  'Runtime protocol contracts',
  'Runtime response privacy',
  'ZIP package profile',
  'Sniptale identity',
  'Contract optionality drift',
  'Messaging schema casts',
  'Network fetch policy',
  'Export artifact boundaries',
  'Backup import atomicity',
  'Contract parser coverage',
  'Resource budget consistency',
  'Resource lifecycle pairs',
  'State-machine proof',
  'Hot-loop work',
  'Runtime listener ownership',
  'Entrypoint wiring',
  'Logging policy',
  'Dependency admission',
  'Secret storage',
  'Sensitive retention',
  'Fetch ownership',
  'Diagnostic sanitization',
  'Suppression directives',
  'Messaging',
  'Root scatter',
  'Read path side effects',
  'Read-safe naming',
  'Lifecycle intent loss',
  'Success/failure asymmetry',
  'Destructive async swaps',
  'Storage write patterns',
  'Parser snapshot purity',
  'History revision semantics',
  'History detached snapshots',
  'History transaction lifecycle',
  'Manifest integrity',
  'Manifest permissions',
  'Runtime topology',
  'Package boundaries',
  'App-core owners',
  'Target-only paths',
  'OSS release surface',
  'Shared UI boundaries',
  'Browser adapters',
  'Heavy runtime imports',
  'Canonical facades',
  'Root side effects',
  'Shared style ownership',
  'Interface surfaces',
  'Returned object surfaces',
  'Multi-message transitions',
  'UI automation seams',
  'Interactive controller ownership',
];

it('keeps verify-all violation steps in the documented focused-to-broad order', async () => {
  const { VERIFY_ALL_VIOLATION_STEPS } = await import('./verify-all.violation-steps.mjs');

  expect(VERIFY_ALL_VIOLATION_STEPS.map(([label]) => label)).toEqual(
    VERIFY_ALL_VIOLATION_STEP_ORDER
  );
});

it('keeps qa:release as a thin observed wrapper over the release-grade core flow', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/release.mjs', 'utf8');

  expect(source).toContain("wrapperId: 'qa:release'");
  expect(source).toContain('runObservedWrapper({');
  expect(source).toContain('blocking: true');
  expect(source).toContain('fullVerifyCollector({ releaseMode: true, verifyScope })');
  expect(source).toContain("harnessStateAsserter(currentContext, 'qa:release')");
  expect(source).toContain("label: 'QA release'");
  expect(source).toContain('process.exitCode = outcome.exitCode');
  expect(source).not.toContain('no product targets');
  expect(source).not.toContain('HARNESS_QA_GUIDANCE');
  expect(source).not.toContain('assertFreshAdvisoryState');
  expect(source).not.toContain('assertFreshCheckpointState');
});

it('keeps qa:release-harness as the harness-only validation wrapper', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/release-harness.mjs', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts['qa:release-harness']).toBe(
    'node tooling/qa/wrappers/release-harness.mjs'
  );
  expect(source).toContain("wrapperId: 'qa:release-harness'");
  expect(source).toContain('collectHarnessStepResults');
  expect(source).toContain('writeHarnessState');
  expect(source).toContain('runObservedWrapper({');
  expect(source).toContain('blocking: true');
  expect(source).not.toContain('SNIPTALE_VITEST_SUITE=product');
});

it('keeps the release wrapper direct steps in the aggregate order around tests and build', () => {
  expect(FULL_DIRECT_WRAPPER_STEPS.map(({ label }) => label)).toEqual([
    'Changed-line readability',
    'Oxlint',
    'ESLint',
    'SonarJS',
    'AI limits',
    'Naming',
    'i18n',
    'Design system',
    'Audit',
    'Security',
    'Dependency boundaries',
    'Cycles',
    'Typecheck',
    'Dead exports',
    'Unit tests',
    'Test coverage',
    'Build',
    'Release archive',
  ]);
});

it('keeps the focused wrapper direct steps in the aggregate reporting order around dead exports', () => {
  expect(FOCUSED_DIRECT_WRAPPER_STEPS.map(({ label }) => label)).toEqual([
    'Format',
    'Oxlint',
    'ESLint',
    'SonarJS',
    'Changed-line readability',
    'AI limits',
    'Mock export parity',
    'Security',
    'Dead exports',
    'Unit tests',
    'Test coverage',
  ]);
});

it('keeps focused guardrail runners on explicit existing code files', () => {
  const executionSource = fs.readFileSync('tooling/qa/core/verify-focused.execution.mjs', 'utf8');
  const codeStepsSource = fs.readFileSync('tooling/qa/core/verify-focused.code-steps.mjs', 'utf8');

  expect(executionSource).toContain('filterImportOrMockOnlyDiffFiles(codeFiles)');
  expect(executionSource).toContain("runner({ files: behavioralCodeFiles, scope: 'workspace' })");
  expect(codeStepsSource).not.toContain('(files) =>');
  expect(codeStepsSource).toContain('runUiAutomationSeamCheck');
  expect(codeStepsSource).not.toContain('runChangedUiAutomationSeamCheck');
});

it('keeps qa:checkpoint self-contained with advisory and a blocking-wrapper lock', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/checkpoint.mjs', 'utf8');
  const cliSource = fs.readFileSync('tooling/qa/wrappers/checkpoint-cli.mjs', 'utf8');
  const advisoryHelper = fs.readFileSync('tooling/qa/core/advisory-report.helpers.mjs', 'utf8');

  expect(cliSource).toContain("wrapperId: 'qa:checkpoint'");
  expect(source).toContain('qa:checkpoint does not create commits');
  expect(source).toContain('runPrettierWrite(context.existingTargetFiles)');
  expect(source).toContain('collectAndPersistAdvisoryReport(context, {');
  expect(advisoryHelper).toContain('writeAdvisoryState(');
  expect(source).toContain('assertFreshHarnessState');
  expect(cliSource).toContain('runObservedWrapper({');
  expect(cliSource).toContain('blocking: true');
  expect(cliSource).toContain("label: 'QA checkpoint'");
});

it('keeps qa:closeout as checkpoint plus qa:build commit handoff', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/closeout.mjs', 'utf8');
  const handoffSource = fs.readFileSync('tooling/qa/wrappers/closeout-build-handoff.mjs', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts['qa:checkpoint']).toBe('node tooling/qa/wrappers/checkpoint.mjs');
  expect(packageJson.scripts['qa:closeout']).toBe('node tooling/qa/wrappers/closeout.mjs');
  expect(source).toContain("wrapperId: 'qa:closeout'");
  expect(source).toContain('qa:closeout requires -m "commit message"');
  expect(source).toContain('runCheckpoint');
  expect(handoffSource).toContain('(dependencies.npmRunner ?? runNpm)(');
  expect(handoffSource).toContain("['run', '--silent', 'qa:build', '--', ...buildArgs]");
  expect(source).toContain("label: 'QA closeout'");
  expect(source).toContain('runObservedWrapper({');
  expect(source).toContain('blocking: true');
});

it('keeps qa:preflight read-only and outside closeout state', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/preflight.mjs', 'utf8');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>;
  };

  expect(packageJson.scripts['qa:preflight']).toBe('node tooling/qa/wrappers/preflight.mjs');
  expect(source).toContain('const JS_LIKE_FILE_PATTERN = /\\.(?:ts|tsx|js|mjs|cjs)$/u;');
  expect(source).toContain('collectPreflightReport');
  expect(source).toContain('renderPreflightReport');
  expect(source).not.toContain('runPrettierWrite');
  expect(source).not.toContain('writeAdvisoryState');
  expect(source).not.toContain('writeCheckpointState');
  expect(source).not.toContain('acquireBlockingWrapperLock');
  expect(source).not.toContain('runNpm');
  expect(source).not.toContain('runCommand');
});

it('keeps qa:build gated on fresh checkpoint state with opt-in commit close-out', () => {
  const source = fs.readFileSync('tooling/qa/wrappers/build.mjs', 'utf8');
  const runSource = fs.readFileSync('tooling/qa/wrappers/build-run.mjs', 'utf8');
  const executionSource = fs.readFileSync('tooling/qa/core/verify-build.execution.mjs', 'utf8');
  const commitStepSource = fs.readFileSync('tooling/qa/wrappers/build.commit-steps.mjs', 'utf8');

  expect(source).toContain("wrapperId: 'qa:build'");
  expect(source).toContain('checkpointStateAsserter = assertFreshCheckpointState');
  expect(runSource).toContain("checkpointStateAsserter(context, 'qa:build');");
  expect(source).toContain("harnessStateAsserter(context, 'qa:build');");
  expect(source).toContain('closeoutStepCollector = collectBuildCloseoutStepResults');
  expect(executionSource).toContain('runArchitectureGuardrailCheck');
  expect(executionSource).toContain("'Architecture guardrails'");
  expect(source).toContain('runObservedWrapper({');
  expect(source).toContain('blocking: true');
  expect(source).toContain("parseWrapperArguments('qa:build', argv)");
  expect(source).toContain('qa:build --commit requires -m "commit message"');
  expect(runSource).toContain('collectOptionalCommitSteps');
  expect(commitStepSource).toContain("createProcessStep('Stage changes'");
  expect(commitStepSource).toContain("'Task artifacts'");
  expect(commitStepSource).toContain("'Git commit'");
  expect(source).not.toContain('collectFocusedStepResults(');
});

it('routes every canonical wrapper entrypoint through the observed lifecycle', () => {
  const entrypoints = [
    'tooling/qa/wrappers/preflight.mjs',
    'tooling/qa/wrappers/advisory.mjs',
    'tooling/qa/wrappers/checkpoint-cli.mjs',
    'tooling/qa/wrappers/closeout.mjs',
    'tooling/qa/wrappers/build.mjs',
    'tooling/qa/wrappers/release-harness.mjs',
    'tooling/qa/wrappers/release.mjs',
    'tooling/qa/wrappers/audit.mjs',
    'tooling/test/e2e/run-e2e.mjs',
  ];

  for (const entrypoint of entrypoints) {
    expect(fs.readFileSync(entrypoint, 'utf8'), entrypoint).toContain('runObservedWrapper({');
  }
});
