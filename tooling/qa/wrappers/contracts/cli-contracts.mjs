import { parseStrictArguments } from '../../runtime/process/shared-cli.mjs';

const NO_OPTIONS = [];

export const QA_WRAPPER_CLI_CONTRACTS = Object.freeze({
  'qa:preflight': {
    command: 'qa:preflight',
    entrypoint: 'tooling/qa/wrappers/preflight.mjs',
    lifecycleLabel: 'QA preflight',
    scripts: ['qa:preflight'],
    usage: 'npm run qa:preflight -- [--files <path...>] [--verbose]',
    description:
      'Inspect the current diff or an explicit file set without changing repository state.',
    options: [
      {
        name: '--files',
        kind: 'many',
        key: 'files',
        description: 'Inspect explicit repository paths.',
      },
      {
        name: '--verbose',
        kind: 'flag',
        key: 'verbose',
        description: 'Print the full report in addition to the run log.',
      },
    ],
  },
  'qa:advisory': {
    command: 'qa:advisory',
    entrypoint: 'tooling/qa/wrappers/advisory.mjs',
    lifecycleLabel: 'QA advisory',
    scripts: ['qa:advisory'],
    usage: 'npm run qa:advisory',
    description: 'Collect non-blocking advisory evidence for the current diff.',
    options: NO_OPTIONS,
  },
  'qa:structural-audit': {
    command: 'qa:structural-audit',
    entrypoint: 'tooling/qa/wrappers/structural-audit.mjs',
    lifecycleLabel: 'QA structural audit',
    scripts: ['qa:structural-audit'],
    usage: 'npm run qa:structural-audit -- [--verbose]',
    description:
      'Generate a manual, report-only structural and owner/change-reason topology snapshot.',
    options: [
      {
        name: '--verbose',
        kind: 'flag',
        key: 'verbose',
        description: 'Print observed step diagnostics in addition to the report summary.',
      },
    ],
  },
  'qa:checkpoint': {
    command: 'qa:checkpoint',
    entrypoint: 'tooling/qa/wrappers/checkpoint.mjs',
    lifecycleLabel: 'QA checkpoint',
    scripts: ['qa:checkpoint'],
    usage: 'npm run qa:checkpoint',
    description: 'Run the focused blocking product gate for the current diff.',
    options: NO_OPTIONS,
  },
  'qa:closeout': {
    command: 'qa:closeout',
    entrypoint: 'tooling/qa/wrappers/closeout.mjs',
    lifecycleLabel: 'QA closeout',
    scripts: ['qa:closeout'],
    usage: 'npm run qa:closeout -- -m <commit-message>',
    description: 'Reuse or run required proof, build artifacts, stage allowed changes, and commit.',
    options: [
      { name: '-m', kind: 'value', key: 'commitMessage', description: 'Required commit message.' },
    ],
  },
  'qa:build': {
    command: 'qa:build',
    entrypoint: 'tooling/qa/wrappers/build.mjs',
    lifecycleLabel: 'QA build',
    scripts: ['qa:internal:build'],
    usage: 'npm run qa:internal:build -- [--proof | --commit -m <message>]',
    description:
      'Build artifacts or perform the closeout build/commit handoff for the current diff.',
    options: [
      {
        name: '--proof',
        kind: 'flag',
        key: 'proofOnly',
        description: 'Build artifact proof only.',
      },
      {
        name: '--commit',
        kind: 'flag',
        key: 'shouldCommit',
        description: 'Run commit-owned closeout steps.',
      },
      {
        name: '-m',
        kind: 'value',
        key: 'commitMessage',
        description: 'Commit message used with --commit.',
      },
    ],
  },
  'qa:release-harness': {
    command: 'qa:release-harness',
    entrypoint: 'tooling/qa/wrappers/release-harness.mjs',
    lifecycleLabel: 'QA release harness',
    scripts: ['qa:release-harness'],
    usage: 'npm run qa:release-harness',
    description: 'Validate changed QA harness and control-plane files.',
    options: NO_OPTIONS,
  },
  'ci:proof': {
    command: 'ci:proof',
    entrypoint: 'tooling/ci/proof-wrapper.mjs',
    lifecycleLabel: 'CI proof',
    scripts: [],
    usage: 'npm run ci:proof -- [--pr <number>] [--cpu N] [--memory-mib N] [--workers N]',
    description: 'Run the complete fast proof through the canonical QA composition.',
    options: NO_OPTIONS,
  },
  'ci:release': {
    command: 'ci:release',
    entrypoint: 'tooling/ci/release-wrapper.mjs',
    lifecycleLabel: 'CI release',
    scripts: [],
    usage: 'npm run ci:release -- [--cpu N] [--memory-mib N] [--workers N]',
    description: 'Run full release proof, blocking audits, coverage, and advisory artifacts.',
    options: NO_OPTIONS,
  },
  'qa:e2e': {
    command: 'qa:e2e',
    entrypoint: 'tooling/test/e2e/run-e2e.mjs',
    lifecycleLabel: 'QA E2E',
    scripts: [
      'qa:e2e',
      'qa:e2e:smoke',
      'qa:e2e:critical',
      'qa:e2e:security',
      'qa:e2e:all',
      'qa:e2e:headed',
      'qa:e2e:smoke:headed',
      'qa:e2e:critical:headed',
    ],
    usage: 'npm run qa:e2e -- [--suite <smoke|critical|security|all>] [--headed]',
    description: 'Build the extension E2E artifact and run the selected Playwright suite.',
    options: [
      {
        name: '--suite',
        kind: 'value',
        key: 'suite',
        description: 'Playwright suite: smoke, critical, security, or all.',
      },
      { name: '--headed', kind: 'flag', key: 'headed', description: 'Run with a visible browser.' },
    ],
  },
});

export function parseWrapperArguments(wrapperId, argv = []) {
  const contract = QA_WRAPPER_CLI_CONTRACTS[wrapperId];
  if (!contract) throw new Error(`Unknown canonical QA wrapper: ${wrapperId}`);
  return parseStrictArguments(argv, contract);
}
