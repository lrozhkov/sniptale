import fs from 'node:fs';
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createTempRoot, initGitRepo, runGit, withCwd } from '../../test-support/test-helpers';
import { runObservedWrapper } from './runner.mjs';
import { HOST_QUEUE_TICKET_ENV } from '../../runtime/locking/host-queue.mjs';
import { collectRepositoryContext } from '../../runtime/observability/repository-context.mjs';
import { parseRunRecord } from '../../runtime/observability/schema.mjs';

function createTestLockFactory() {
  const release = vi.fn();
  return { lockFactory: vi.fn(() => ({ release })), release };
}

const ignoreStepContract = () => {};
const PRIVATE_VALUES = {
  secret: 'private-fixture',
  username: 'qa-private-username',
  hostname: 'qa-private-hostname',
  handoffToken: 'qa-private-handoff-token',
  dynamicToken: 'qa-dynamic-parent-token',
  commitMessage: 'qa private commit message',
};
const JSON_ONLY_SECRETS = ['json-child-api-key', 'json-child-bearer'];

it('waits before execution, reads fresh inputs, and releases both slots after failure', async () => {
  const root = createTempRoot('observed-wrapper-host-wait-');
  const storageRoot = createTempRoot('observed-wrapper-host-wait-records-');
  initGitRepo(storageRoot);
  initGitRepo(root);
  const candidate = `${root}/candidate.txt`;
  fs.writeFileSync(candidate, 'before');
  runGit(root, 'add', 'candidate.txt');
  runGit(root, 'commit', '-m', 'initial fixture');
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const { lockFactory, release } = createTestLockFactory();
  const releaseHost = vi.fn();
  let grant!: (slot: { ticketName: string; release: typeof releaseHost }) => void;
  const admission = new Promise<{ ticketName: string; release: typeof releaseHost }>((resolve) => {
    grant = resolve;
  });
  const hostSlotFactory = vi.fn(() => admission);
  const previous = process.env[HOST_QUEUE_TICKET_ENV];
  const execute = vi.fn(async () => {
    expect(fs.readFileSync(candidate, 'utf8')).toBe('after');
    expect(process.env[HOST_QUEUE_TICKET_ENV]).toBe('fixture-ticket');
    throw new Error('Expected fixture failure.');
  });
  try {
    await withCwd(root, async () => {
      const running = runObservedWrapper({
        wrapperId: 'qa:checkpoint',
        label: 'QA checkpoint',
        blocking: true,
        argv: [],
        environment: {
          ...process.env,
          CODEX_THREAD_ID: 'queue-fixture',
          SNIPTALE_QA_OBSERVABILITY_ROOT: storageRoot,
        },
        contractValidator: ignoreStepContract,
        lockFactory,
        hostSlotFactory,
        execute,
      });
      expect(hostSlotFactory).toHaveBeenCalledOnce();
      expect(execute).not.toHaveBeenCalled();
      fs.writeFileSync(candidate, 'intermediate');
      runGit(root, 'add', 'candidate.txt');
      runGit(root, 'commit', '-m', 'queued fixture update');
      fs.writeFileSync(candidate, 'after');
      const admittedRepository = collectRepositoryContext({ rootDir: root });
      grant({ ticketName: 'fixture-ticket', release: releaseHost });
      const result = await running;
      expect(result.exitCode).toBe(1);
      expect(result.record.repository.diffFingerprint).toBe(admittedRepository.diffFingerprint);
      expect(result.record.repository.head).toBe(admittedRepository.head);
      expect(result.record.repository.treeFingerprint).toBe(admittedRepository.treeFingerprint);
      const persisted = parseRunRecord(JSON.parse(fs.readFileSync(result.runPath, 'utf8')));
      expect(persisted.repository).toMatchObject(admittedRepository);
      expect(persisted.correlation.workflowId).toBe(
        `workflow.${createHash('sha256')
          .update(`queue-fixture\0${admittedRepository.head}`)
          .digest('hex')
          .slice(0, 24)}`
      );
      expect(execute).toHaveBeenCalledOnce();
      expect(result.record.timeline.activities).toContainEqual(
        expect.objectContaining({
          activityId: 'wrapper.host-admission',
          kind: 'host-admission',
          state: 'completed',
        })
      );
      expect(releaseHost).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(process.env[HOST_QUEUE_TICKET_ENV]).toBe(previous);
    });
  } finally {
    output.mockRestore();
  }
});

it.each([
  { wrapperId: 'qa:preflight', blocking: false, argv: [], handoff: false },
  { wrapperId: 'qa:checkpoint', blocking: true, argv: ['--help'], handoff: false },
  { wrapperId: 'qa:build', blocking: true, argv: [], handoff: true },
])(
  'does not acquire another host slot for $wrapperId with help=$argv and handoff=$handoff',
  async ({ wrapperId, blocking, argv, handoff }) => {
    const root = createTempRoot('observed-wrapper-without-host-wait-');
    initGitRepo(root);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const hostSlotFactory = vi.fn();
    const release = vi.fn();
    try {
      const result = await withCwd(root, () =>
        runObservedWrapper({
          wrapperId,
          label: 'Fixture',
          blocking,
          argv,
          environment: { ...process.env, SNIPTALE_QA_OBSERVABILITY_ROOT: root },
          contractValidator: ignoreStepContract,
          lockFactory: () => ({ handoff, release }),
          hostSlotFactory,
          execute: async () => ({ steps: [] }),
        })
      );
      expect(result.exitCode).toBe(0);
      expect(hostSlotFactory).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  }
);

function createPrivateEnvironment(root: string) {
  return {
    ...process.env,
    SNIPTALE_QA_OBSERVABILITY_ROOT: root,
    'NPM_CONFIG_//registry.npmjs.org/:_authToken': PRIVATE_VALUES.secret,
    SNIPTALE_QA_CLOSEOUT_BUILD_LOCK: PRIVATE_VALUES.handoffToken,
    USER: PRIVATE_VALUES.username,
    HOSTNAME: PRIVATE_VALUES.hostname,
  };
}

function createPrivateFailure(session: { addSensitiveValues: (values: string[]) => void }) {
  session.addSensitiveValues([PRIVATE_VALUES.dynamicToken]);
  return {
    steps: [
      {
        label: 'ESLint',
        status: 'failed',
        stdout: [
          ...Object.values(PRIVATE_VALUES),
          `src/private.ts:7:2: token=${PRIVATE_VALUES.secret}`,
          `src/private.ts:8:2: ${PRIVATE_VALUES.dynamicToken}`,
          JSON.stringify({
            apiKey: JSON_ONLY_SECRETS[0],
            Authorization: `Bearer ${JSON_ONLY_SECRETS[1]}`,
          }),
        ].join('\n'),
      },
    ],
  };
}

function expectPrivateValuesRedacted(...outputs: string[]) {
  for (const privateValue of Object.values(PRIVATE_VALUES)) {
    for (const output of outputs) expect(output).not.toContain(privateValue);
  }
}

describe('observed wrapper lifecycle', () => {
  it('persists success and failure, rejects unknown CLI, and releases the lock', async () => {
    const root = createTempRoot('observed-wrapper-');
    initGitRepo(root);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { lockFactory, release } = createTestLockFactory();
    const hostSlotFactory = vi.fn(async () => ({ ticketName: null, release: vi.fn() }));

    await withCwd(root, async () => {
      const environment = { ...process.env, SNIPTALE_QA_OBSERVABILITY_ROOT: root };
      const success = await runObservedWrapper({
        wrapperId: 'qa:checkpoint',
        label: 'QA checkpoint',
        argv: [],
        blocking: true,
        contractValidator: ignoreStepContract,
        environment,
        lockFactory,
        hostSlotFactory,
        execute: async () => ({
          context: { suite: 'product', targetFiles: ['src/a.ts'] },
          steps: [{ label: 'Oxlint', status: 'ok', durationMs: 3 }],
        }),
      });
      expect(success.exitCode).toBe(0);
      expect(success.record.repository.targetFiles).toEqual(['src/a.ts']);
      expect(fs.existsSync(success.runPath)).toBe(true);

      const failure = await runObservedWrapper({
        wrapperId: 'qa:checkpoint',
        label: 'QA checkpoint',
        argv: ['--token=private-argv-value'],
        blocking: true,
        contractValidator: ignoreStepContract,
        environment,
        lockFactory,
        hostSlotFactory,
        execute: async () => ({ steps: [] }),
      });
      expect(failure.exitCode).toBe(1);
      expect(failure.record.summary.problemIds).toEqual(['wrapper.unhandled-error']);
      expect(fs.readFileSync(`${root}/${failure.record.log.path}`, 'utf8')).not.toContain(
        'private-argv-value'
      );
      expect(lockFactory).toHaveBeenCalledTimes(1);
      expect(release).toHaveBeenCalledTimes(1);
    });

    output.mockRestore();
  });
});

it('classifies denied read-only git access as an environment failure', async () => {
  const root = createTempRoot('observed-wrapper-git-access-');
  initGitRepo(root);
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const result = await withCwd(root, () =>
    runObservedWrapper({
      wrapperId: 'qa:preflight',
      label: 'QA preflight',
      argv: [],
      contractValidator: ignoreStepContract,
      environment: { ...process.env, SNIPTALE_QA_OBSERVABILITY_ROOT: root },
      execute: async () => {
        throw Object.assign(new Error('spawnSync git EPERM'), {
          code: 'EPERM',
          syscall: 'spawnSync git',
        });
      },
    })
  );

  output.mockRestore();
  expect(result.record.summary.problemIds).toEqual(['environment.git-access']);
  expect(result.record.steps[0]?.diagnostic?.remediation).toContain('read-only git access');
});

describe('observed wrapper skip lifecycle', () => {
  it('preserves wrapper-level skip semantics for help and no-target results', async () => {
    const root = createTempRoot('observed-wrapper-skipped-');
    initGitRepo(root);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await withCwd(root, async () => {
      const environment = { ...process.env, SNIPTALE_QA_OBSERVABILITY_ROOT: root };
      const help = await runObservedWrapper({
        wrapperId: 'qa:release-harness',
        label: 'QA release harness',
        argv: ['--help'],
        environment,
        execute: async () => ({ steps: [] }),
      });
      const noTargets = await runObservedWrapper({
        wrapperId: 'qa:release-harness',
        label: 'QA release harness',
        environment,
        execute: async () => ({
          skipped: true,
          steps: [{ label: 'QA release harness', status: 'ok', detail: 'no matching files' }],
        }),
      });

      expect(help.record).toMatchObject({ status: 'skipped', exitCode: 0 });
      expect(noTargets.record).toMatchObject({ status: 'skipped', exitCode: 0 });
      expect(help.record.repository.mode).toBe('help');
      expect(noTargets.record.repository.mode).toBe('no-targets');
      expect(noTargets.summary).toContain('QA release harness: skipped');
    });
    output.mockRestore();
  });
});

describe('observed wrapper secret handling', () => {
  it('redacts compound environment keys and raw secret values from failed child output', async () => {
    const root = createTempRoot('observed-wrapper-secret-');
    initGitRepo(root);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await withCwd(root, async () => {
      const failure = await runObservedWrapper({
        wrapperId: 'qa:build',
        label: 'QA build',
        argv: ['--commit', '-m', PRIVATE_VALUES.commitMessage],
        contractValidator: ignoreStepContract,
        environment: createPrivateEnvironment(root),
        execute: async ({ session }) => createPrivateFailure(session),
      });
      const log = fs.readFileSync(`${root}/${failure.record.log.path}`, 'utf8');
      const record = fs.readFileSync(failure.runPath, 'utf8');
      expectPrivateValuesRedacted(log, record);
      for (const privateValue of JSON_ONLY_SECRETS) {
        expect(log).not.toContain(privateValue);
        expect(record).not.toContain(privateValue);
      }
      expect(failure.record.repository.mode).toBe('commit');
    });
    output.mockRestore();
  });
});

describe('observed wrapper console output', () => {
  it('prints a sanitized command-safe tail for a failed step without verbose mode', async () => {
    const root = createTempRoot('observed-wrapper-failure-tail-');
    initGitRepo(root);
    const writes: string[] = [];
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await withCwd(root, async () => {
      await runObservedWrapper({
        wrapperId: 'qa:checkpoint',
        label: 'QA checkpoint',
        argv: [],
        contractValidator: ignoreStepContract,
        environment: createPrivateEnvironment(root),
        execute: async () => ({
          steps: [
            {
              label: 'Unit tests',
              status: 'failed',
              stdout: [
                'old output\n'.repeat(5000),
                'safe\r::add-mask::private-fixture',
                '\r::error private-fixture\nAssertionError: expected true',
              ].join(''),
            },
          ],
        }),
      });
    });
    const stdout = writes.join('');
    expect(stdout).toContain('[Unit tests: failure output tail]');
    expect(stdout).toContain('| AssertionError: expected true');
    expect(stdout).toContain('| ::error <redacted>');
    expect(stdout).toContain('| ::add-mask::<redacted>');
    expect(stdout).not.toMatch(/^::error/gmu);
    expect(stdout).not.toMatch(/^::add-mask/gmu);
    expect(stdout).not.toContain('\r::');
    expect(stdout).not.toContain(PRIVATE_VALUES.secret);
    output.mockRestore();
  });

  it('prints one sanitized bounded report block before the summary and records it in the log', async () => {
    const root = createTempRoot('observed-wrapper-console-');
    initGitRepo(root);
    const writes: string[] = [];
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await withCwd(root, async () => {
      const result = await runObservedWrapper({
        wrapperId: 'qa:checkpoint',
        label: 'QA checkpoint',
        argv: [],
        contractValidator: ignoreStepContract,
        environment: createPrivateEnvironment(root),
        execute: async () => ({
          steps: [
            {
              label: 'Advisory report',
              status: 'ok',
              consoleOutput: `attention=0, watch=0 ${PRIVATE_VALUES.secret}\n${'x'.repeat(20_000)}`,
            },
          ],
        }),
      });
      const stdout = writes.join('');
      const log = fs.readFileSync(`${root}/${result.record.log.path}`, 'utf8');
      expect(stdout).not.toContain(PRIVATE_VALUES.secret);
      expect(log).not.toContain(PRIVATE_VALUES.secret);
      expect(stdout.match(/attention=0, watch=0/gu)).toHaveLength(1);
      expect(stdout.match(/console output truncated/gu)).toHaveLength(1);
      expect(stdout.indexOf('attention=0, watch=0')).toBeLessThan(
        stdout.indexOf('QA checkpoint: all passed')
      );
      expect(log).toContain('[Advisory report.console]');
    });
    output.mockRestore();
  });

  it('summarizes a large advisory inventory in the console and preserves every finding in the log', async () => {
    const root = createTempRoot('observed-wrapper-large-advisory-');
    initGitRepo(root);
    const writes: string[] = [];
    const output = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await withCwd(root, async () => {
      const advisories = Array.from({ length: 20 }, (_, index) => ({
        id: `finding-${index}`,
        file: `src/file-${index}.ts`,
        line: null,
        reason: `reason-${index}`,
        severity: 'watch',
      }));
      const result = await runObservedWrapper({
        wrapperId: 'qa:checkpoint',
        label: 'QA checkpoint',
        contractValidator: ignoreStepContract,
        environment: createPrivateEnvironment(root),
        execute: async () => ({
          advisory: { introduced: advisories, worsened: [], existing: [] },
          steps: [
            {
              label: 'Advisory report',
              status: 'ok',
              consoleOutput: 'bounded rendered report',
              advisories,
            },
          ],
        }),
      });
      const stdout = writes.join('');
      const log = fs.readFileSync(`${root}/${result.record.log.path}`, 'utf8');
      expect(stdout).toContain('Advisory report: 20 advisory findings (top 6)');
      expect(stdout).not.toContain('finding-19');
      expect(log).not.toContain('[Advisory report.advisories]');
      expect(log).toContain('finding-19');
      expect(result.record.advisory?.introduced).toHaveLength(20);
    });
    output.mockRestore();
  });
});

it.each(['Advisory report', 'QA checkpoint'])(
  'prints blockers before canonical %s and stores one complete section',
  async (advisoryLabel) => {
    const root = createTempRoot('observed-wrapper-advisory-order-');
    initGitRepo(root);
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const result = await withCwd(root, () =>
        runObservedWrapper({
          wrapperId: 'qa:checkpoint',
          label: 'QA checkpoint',
          argv: [],
          contractValidator: ignoreStepContract,
          environment: { ...process.env, SNIPTALE_QA_OBSERVABILITY_ROOT: root },
          execute: async () => ({
            steps: [
              {
                label: advisoryLabel,
                status: 'ok',
                consoleOutput:
                  'Change risk: HIGH\nRequired: security-code-review\nAdvisory: introduced=1\n',
                advisories: [
                  { id: 'advisory.structural-file', file: 'src/a.ts', reason: 'unique finding' },
                ],
                stdout: 'Advisory log:\n- src/a.ts unique finding\n',
              },
              {
                label: 'Structural risk',
                status: 'ok',
                advisories: [{ file: 'src/a.ts', reason: 'unique finding' }],
              },
              {
                label: 'Oxlint',
                status: 'failed',
                summary: 'Missing cause',
                advice: '',
                stdout: 'src/a.ts:4:2: Missing error cause. [Error/eslint(preserve-caught-error)]',
              },
            ],
          }),
        })
      );
      const consoleText = output.mock.calls.map(([value]) => String(value)).join('');
      const log = fs.readFileSync(`${root}/${result.record.log.path}`, 'utf8');
      expect(consoleText).toContain('Blockers:');
      expect(log).toContain('Blockers:');
      expect(consoleText.indexOf('Blockers:')).toBeLessThan(consoleText.indexOf('Advisory:'));
      expect(consoleText).toContain('Required: security-code-review');
      expect(log.indexOf('Blockers:')).toBeLessThan(log.indexOf('Advisory log:'));
      expect(log.match(/unique finding/gu)).toHaveLength(1);
      expect(
        result.record.steps.find((step) => step.stepId === 'qa.rule.oxlint')?.diagnostic
      ).toMatchObject({
        locations: [expect.objectContaining({ file: 'src/a.ts', line: 4 })],
        remediation: expect.stringContaining('reported tool'),
      });
    } finally {
      output.mockRestore();
    }
  }
);
