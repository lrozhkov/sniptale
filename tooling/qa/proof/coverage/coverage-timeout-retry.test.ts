import fs from 'node:fs';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { runRepoNodeEntryAsync } from '../unit/verify-unit-tests.mjs';
import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import {
  runCoverageWithTimeoutRetry,
  writeUnitAttemptEvidence,
  readUnitAttemptEvidence,
} from './coverage-timeout-retry.mjs';

const file = 'apps/extension/src/retry.test.ts';
const timeout = {
  name: 'Error',
  assertion: false,
  stack: 'original timeout stack',
  message:
    'Test timed out in 15000ms.\n' +
    'If this is a long-running test, pass a timeout value as the last argument ' +
    'or configure it globally with "testTimeout".',
};
const assertion = {
  ...timeout,
  name: 'AssertionError',
  assertion: true,
  message: 'expected 1 to be 2',
};

function report(errors: (typeof timeout)[] = []) {
  const state = errors.length ? 'failed' : 'passed';
  return {
    schemaVersion: 1,
    reason: state,
    processTimeout: false,
    expectedFiles: [file],
    unhandledErrors: [] as (typeof timeout)[],
    hookTimeout: 15000,
    files: [
      {
        file,
        state,
        errors: [],
        suiteErrors: [],
        tests: [
          { id: 'test-id', name: 'complete test', state, errors, timeout: 15000, retries: 0 },
          {
            id: 'skipped-id',
            name: 'skipped test',
            state: 'skipped',
            errors: [],
            timeout: 15000,
            retries: 0,
          },
        ],
      },
    ],
  };
}

function coverage(root: string, hits: number) {
  const source = path.join(root, 'source.ts');
  return {
    [source]: {
      path: source,
      statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
      fnMap: {},
      branchMap: {},
      s: { 0: hits },
      f: {},
      b: {},
    },
  };
}

function harness(
  reports: unknown[],
  options: { changeAfter?: number; corrupt?: boolean; maps?: unknown[] } = {}
) {
  const cwd = createTempRoot('coverage-timeout-');
  let digest = 'original';
  const execute = vi.fn(
    async (_entry: string, args: string[], settings: { env: Record<string, string> }) => {
      const index = execute.mock.calls.length - 1;
      const directory = path.dirname(settings.env.SNIPTALE_UNIT_ATTEMPT_REPORT);
      fs.mkdirSync(directory, { recursive: true });
      if (reports[index] !== undefined)
        fs.writeFileSync(
          settings.env.SNIPTALE_UNIT_ATTEMPT_REPORT,
          options.corrupt ? '{' : JSON.stringify(reports[index])
        );
      fs.writeFileSync(
        path.join(directory, 'coverage-final.json'),
        JSON.stringify(options.maps?.[index] ?? coverage(cwd, index))
      );
      if (options.changeAfter === index) digest = 'changed';
      return {
        status: (reports[index] as { reason?: string })?.reason === 'passed' ? 0 : 1,
        signal: null,
        stdout: `stdout-${index}`,
        stderr: `stderr-${index}`,
      };
    }
  );
  return {
    cwd,
    execute,
    run: () =>
      runCoverageWithTimeoutRetry({
        cwd,
        maxWorkers: 8,
        pool: 'threads',
        expectedInputDigest: 'original',
        getInputDigest: () => digest,
        execute,
      }),
  };
}

it('retries the whole timeout file in a fresh isolated single worker and retains full coverage', async () => {
  const h = harness([report([timeout]), report()]);
  const result = await h.run();
  expect(result.status).toBe(0);
  expect(result.passedOnAttempt2).toBe(true);
  expect(h.execute).toHaveBeenCalledTimes(2);
  const first = h.execute.mock.calls[0][1];
  const retry = h.execute.mock.calls[1][1];
  expect(first).toContain('--maxWorkers=8');
  expect(retry).toEqual(
    expect.arrayContaining([
      '--maxWorkers=1',
      '--pool=threads',
      '--isolate',
      `./${file}`,
      '--retry=0',
    ])
  );
  expect(retry).not.toContain('--passWithNoTests');
  expect(retry.some((arg) => arg.includes('testNamePattern'))).toBe(false);
  expect(first).toContain('--coverage.reportOnFailure=true');
  expect(result.stdout).toContain('[attempt 2:');
  expect(result.stderr).toContain('stderr-0');
  expect(
    JSON.parse(fs.readFileSync(result.reportPath!, 'utf8'))[path.join(h.cwd, 'source.ts')].s[0]
  ).toBe(1);
  expect(
    JSON.parse(
      fs.readFileSync(path.join(h.cwd, '.tmp/coverage/unit/attempt-1/coverage-final.json'), 'utf8')
    )[path.join(h.cwd, 'source.ts')].s[0]
  ).toBe(0);
  writeUnitAttemptEvidence(result, h.cwd);
  const receipt = readUnitAttemptEvidence(
    fs.readFileSync(path.join(h.cwd, 'html/unit-attempts.json'), 'utf8')
  );
  expect(receipt.attempts[0].report.files[0].tests[0].errors[0]).toEqual(timeout);
  expect(receipt.attempts[0].process.stdout).toBe('stdout-0');
});

it('merges initial full-suite files that do not occur in the retry map', async () => {
  const h = harness([report([timeout]), report()]);
  const initial = coverage(h.cwd, 1);
  const other = path.join(h.cwd, 'other.ts');
  const initialOther = { ...Object.values(initial)[0], path: other, s: { 0: 3 } };
  h.execute.mockImplementationOnce(async (_entry, _args, settings) => {
    const directory = path.dirname(settings.env.SNIPTALE_UNIT_ATTEMPT_REPORT);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(settings.env.SNIPTALE_UNIT_ATTEMPT_REPORT, JSON.stringify(report([timeout])));
    fs.writeFileSync(
      path.join(directory, 'coverage-final.json'),
      JSON.stringify({ ...initial, [other]: initialOther })
    );
    return { status: 1, signal: null, stdout: 'first failure', stderr: '' };
  });
  const result = await h.run();
  expect(result.status).toBe(0);
  const merged = JSON.parse(fs.readFileSync(result.reportPath!, 'utf8'));
  expect(merged[other].s[0]).toBe(3);
  expect(merged[path.join(h.cwd, 'source.ts')].s[0]).toBe(2);
});

it('leaves a second timeout red without a third invocation', async () => {
  const h = harness([report([timeout]), report([timeout])]);
  expect((await h.run()).status).toBe(1);
  expect(h.execute).toHaveBeenCalledTimes(2);
});

it.each([[assertion], [timeout, assertion]])(
  'does not retry assertion or mixed failures: %j',
  async (...errors) => {
    const h = harness([report(errors)]);
    expect((await h.run()).status).toBe(1);
    expect(h.execute).toHaveBeenCalledOnce();
  }
);

it.each(['missing', 'corrupt', 'empty', 'unhandled', 'incomplete'])(
  'rejects %s attempt evidence',
  async (kind) => {
    const value = report([timeout]);
    if (kind === 'empty') value.files[0].tests = [];
    if (kind === 'unhandled') value.unhandledErrors = [timeout];
    if (kind === 'incomplete') value.expectedFiles.push('missing.test.ts');
    const h = harness([kind === 'missing' ? undefined : value], { corrupt: kind === 'corrupt' });
    expect((await h.run()).status).toBe(1);
    expect(h.execute).toHaveBeenCalledOnce();
  }
);

it.each([0, 1])('refuses changed candidate inputs after attempt %i', async (changeAfter) => {
  const h = harness([report([timeout]), report()], { changeAfter });
  expect((await h.run()).status).toBe(1);
  expect(h.execute).toHaveBeenCalledTimes(changeAfter + 1);
});

it('rejects a retry that silently loses a collected test', async () => {
  const retry = report();
  retry.files[0].tests.pop();
  const h = harness([report([timeout]), retry]);
  expect((await h.run()).status).toBe(1);
});

it('refuses an empty coverage map even when every test passes', async () => {
  const h = harness([report()], { maps: [{}] });
  expect((await h.run()).status).toBe(1);
});

it.each(['crash', 'signal', 'disagreement'])('rejects %s process outcomes', async (kind) => {
  const h = harness([report([timeout])]);
  h.execute.mockImplementationOnce(async (_entry, _args, settings) => {
    fs.mkdirSync(path.dirname(settings.env.SNIPTALE_UNIT_ATTEMPT_REPORT), { recursive: true });
    fs.writeFileSync(settings.env.SNIPTALE_UNIT_ATTEMPT_REPORT, JSON.stringify(report([timeout])));
    return {
      status: kind === 'crash' ? 2 : 0,
      signal: kind === 'signal' ? 'SIGTERM' : null,
      stdout: '',
      stderr: '',
    };
  });
  expect((await h.run()).status).toBe(1);
  expect(h.execute).toHaveBeenCalledOnce();
});

it('rejects malformed, incomplete or unresolved sealed retry evidence', async () => {
  const h = harness([report([timeout]), report()]);
  const result = await h.run();
  writeUnitAttemptEvidence(result, h.cwd);
  const text = fs.readFileSync(path.join(h.cwd, 'html/unit-attempts.json'), 'utf8');
  expect(() => readUnitAttemptEvidence('{')).toThrow();
  for (const mutate of [
    (value: ReturnType<typeof readUnitAttemptEvidence>) => {
      value.attempts.pop();
    },
    (value: ReturnType<typeof readUnitAttemptEvidence>) => {
      value.attempts[1].report.files[0].tests.pop();
    },
    (value: ReturnType<typeof readUnitAttemptEvidence>) => {
      value.attempts[0].report.unhandledErrors.push(timeout);
    },
    (value: ReturnType<typeof readUnitAttemptEvidence>) => {
      value.attempts[1].process.status = 1;
    },
  ]) {
    const value = JSON.parse(text);
    mutate(value);
    expect(() => readUnitAttemptEvidence(JSON.stringify(value))).toThrow();
  }
});

it('refuses a retry that changes the timed-out test into a skipped test', async () => {
  const retry = report();
  retry.files[0].tests[0].state = 'skipped';
  const h = harness([report([timeout]), retry]);
  expect((await h.run()).status).toBe(1);
});

it('runs an actual timed-out coverage file once more in a fresh process and merges the full maps', async () => {
  const cwd = createTempRoot('coverage-timeout-process-');
  const vitest = path.resolve('node_modules/vitest/dist/index.js');
  const reporter = path.resolve('tooling/qa/proof/unit/unit-timeout-reporter.mjs');
  const marker = path.join(cwd, 'workers.txt');
  writeFile(cwd, 'source.mjs', 'export function read(value){return value ? 1 : 2;}');
  writeFile(
    cwd,
    'sample.test.mjs',
    `import {test,expect} from ${JSON.stringify(vitest)};
import fs from 'node:fs';import {read} from './source.mjs';
const marker=${JSON.stringify(marker)};
const previous=fs.existsSync(marker);fs.appendFileSync(marker,process.pid+'\\n');
test.skip('skipped',()=>{});
test('bounded',async()=>{expect(read(previous)).toBe(previous?1:2);if(!previous)await new Promise(()=>{});});`
  );
  const config = writeFile(
    cwd,
    'vitest.config.mjs',
    `export default {test:{
root:${JSON.stringify(cwd)},include:['sample.test.mjs'],testTimeout:30,hookTimeout:30,
coverage:{provider:'v8',reporter:['json'],include:['source.mjs']}}};`
  );
  const result = await runCoverageWithTimeoutRetry({
    cwd,
    maxWorkers: 2,
    pool: 'threads',
    expectedInputDigest: 'unchanged',
    getInputDigest: () => 'unchanged',
    execute: (entry, args, options) =>
      runRepoNodeEntryAsync(
        entry,
        [
          ...args.filter((arg) => !arg.startsWith('--reporter=')),
          `--config=${config}`,
          `--reporter=${reporter}`,
        ],
        options
      ),
  });
  expect(result.status, result.stderr).toBe(0);
  expect(result.attempts).toHaveLength(2);
  const workers = fs.readFileSync(marker, 'utf8').trim().split('\n');
  expect(workers).toHaveLength(2);
  expect(workers[0]).not.toBe(workers[1]);
  const merged = JSON.parse(fs.readFileSync(result.reportPath!, 'utf8'));
  expect(Object.keys(merged)).toEqual([path.join(cwd, 'source.mjs')]);
  expect(
    Object.values(merged[path.join(cwd, 'source.mjs')].b)
      .flat()
      .every((hits) => Number(hits) > 0)
  ).toBe(true);
  expect(result.attempts[0].report!.reason).toBe('failed');
  expect(result.attempts[1].report!.reason).toBe('passed');
}, 20000);

it('retries distinct timeout files serially once without rerunning successful files', async () => {
  const first = report([timeout]);
  const other = 'packages/foundation/src/other.test.ts';
  first.expectedFiles.push(other);
  first.files.push({ ...first.files[0], file: other });
  const retryOther = report();
  retryOther.expectedFiles = [other];
  retryOther.files[0].file = other;
  const h = harness([first, report(), retryOther]);
  const result = await h.run();
  expect(result.status).toBe(0);
  expect(h.execute).toHaveBeenCalledTimes(3);
  expect(h.execute.mock.calls[1][1]).toContain(`./${file}`);
  expect(h.execute.mock.calls[2][1]).toContain(`./${other}`);
  expect(result.stdout.match(/attempt 2:/gu)).toHaveLength(2);
  writeUnitAttemptEvidence(result, h.cwd);
  expect(
    readUnitAttemptEvidence(fs.readFileSync(path.join(h.cwd, 'html/unit-attempts.json'), 'utf8'))
      .passedOnAttempt2
  ).toBe(true);
});
