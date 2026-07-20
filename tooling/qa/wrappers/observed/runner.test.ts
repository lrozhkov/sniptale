import fs from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createTempRoot, initGitRepo, withCwd } from '../../core/test-helpers';
import { runObservedWrapper } from './runner.mjs';

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
        execute: async () => ({
          context: { suite: 'product', targetFiles: ['src/a.ts'] },
          steps: [{ label: 'ESLint', status: 'ok', durationMs: 3 }],
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
