import { parseStrictArguments } from '../core/shared-cli.mjs';

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
    scripts: ['qa:build'],
    usage: 'npm run qa:build -- [--proof | --commit -m <message> [--reuse-build]]',
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
        name: '--reuse-build',
        kind: 'flag',
        key: 'reuseBuild',
        description: 'Reuse a fresh artifact build during commit.',
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
  'qa:release': {
    command: 'qa:release',
    entrypoint: 'tooling/qa/wrappers/release.mjs',
    lifecycleLabel: 'QA release',
    scripts: ['qa:release'],
    usage: 'npm run qa:release',
    description: 'Run the repository-wide product release gate.',
    options: NO_OPTIONS,
  },
  'qa:audit': {
    command: 'qa:audit',
    entrypoint: 'tooling/qa/wrappers/audit.mjs',
    lifecycleLabel: 'QA audit',
    scripts: ['qa:audit'],
    usage: 'npm run qa:audit -- [--profile <repository|security|release>]',
    description: 'Run the configured repository audit profile.',
    options: [
      {
        name: '--profile',
        kind: 'value',
        key: 'profile',
        description: 'Audit profile: repository, security, or release.',
      },
    ],
  },
  'qa:e2e': {
    command: 'qa:e2e',
    entrypoint: 'tooling/test/e2e/run-e2e.mjs',
    lifecycleLabel: 'QA E2E',
    scripts: [
      'qa:e2e',
      'qa:e2e:smoke',
      'qa:e2e:critical',
      'qa:e2e:all',
      'qa:e2e:headed',
      'qa:e2e:smoke:headed',
      'qa:e2e:critical:headed',
    ],
    usage: 'npm run qa:e2e -- [--suite <smoke|critical|all>] [--headed]',
    description: 'Build the extension E2E artifact and run the selected Playwright suite.',
    options: [
      {
        name: '--suite',
        kind: 'value',
        key: 'suite',
        description: 'Playwright suite: smoke, critical, or all.',
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
