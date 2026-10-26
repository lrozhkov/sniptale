import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { createTempRoot, writeFile } from '../../test-support/test-helpers';
import { isTimeoutOnlyFile, parseUnitAttemptReport } from './unit-timeout-reporter.mjs';

const execute = promisify(execFile);
const cli = path.resolve('node_modules/vitest/vitest.mjs');
const reporter = path.resolve('tooling/qa/proof/unit/unit-timeout-reporter.mjs');
const vitest = path.resolve('node_modules/vitest/dist/index.js');

function isExpectedFailedRun(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 1 &&
    'signal' in error &&
    error.signal === null &&
    'killed' in error &&
    error.killed === false
  );
}

async function fixtureRun(root: string, source: string, name: string) {
  writeFile(root, 'sample.test.mjs', source);
  const destination = path.join(root, `${name}.json`);
  const config = writeFile(
    root,
    'vitest.config.mjs',
    `export default {test:{
root:${JSON.stringify(root)},include:['sample.test.mjs'],testTimeout:30,hookTimeout:30}};`
  );
  let status = 0;
  try {
    await execute(
      process.execPath,
      [
        cli,
        'run',
        `--config=${config}`,
        `--reporter=${reporter}`,
        '--pool=threads',
        '--maxWorkers=1',
        '--isolate',
        '--retry=0',
      ],
      {
        cwd: root,
        env: { ...process.env, SNIPTALE_UNIT_ATTEMPT_REPORT: destination },
        timeout: 15000,
      }
    );
  } catch (error) {
    if (!isExpectedFailedRun(error)) throw error;
    status = 1;
  }
  return {
    status,
    report: parseUnitAttemptReport(JSON.parse(fs.readFileSync(destination, 'utf8'))),
  };
}

it('uses the actual public reporter API for timeout, skipped/todo tests and a fresh passing worker', async () => {
  const root = createTempRoot('unit-timeout-native-');
  const marker = path.join(root, 'workers.txt');
  const source = `import {test} from ${JSON.stringify(vitest)};
import fs from 'node:fs';
const marker=${JSON.stringify(marker)};
const previous=fs.existsSync(marker);
fs.appendFileSync(marker,process.pid+'\\n');
test.skip('skipped',()=>{});
test.todo('todo');
test('bounded',async()=>{if(!previous)await new Promise(()=>{});});`;
  const first = await fixtureRun(root, source, 'first');
  expect(first.status).toBe(1);
  expect(isTimeoutOnlyFile(first.report.files[0])).toBe(true);
  expect(first.report.files[0].tests.filter((test) => test.state === 'skipped')).toHaveLength(2);
  const second = await fixtureRun(root, source, 'second');
  expect(second.status).toBe(0);
  expect(second.report.reason).toBe('passed');
  const workers = fs.readFileSync(marker, 'utf8').trim().split('\n');
  expect(workers).toHaveLength(2);
  expect(workers[0]).not.toBe(workers[1]);
  expect(second.report.files[0].tests.map((test) => test.id)).toEqual(
    first.report.files[0].tests.map((test) => test.id)
  );
}, 20000);

it('classifies real suite hook timeout overrides and rejects actual assertions and collection errors', async () => {
  const root = createTempRoot('unit-hook-native-');
  const hook = await fixtureRun(
    root,
    `import {test,beforeAll} from ${JSON.stringify(vitest)};
beforeAll(async()=>{await new Promise(()=>{});},20);test('blocked',()=>{});`,
    'hook'
  );
  expect(hook.status).toBe(1);
  expect(isTimeoutOnlyFile(hook.report.files[0])).toBe(true);
  const assertion = await fixtureRun(
    root,
    `import {test,expect} from ${JSON.stringify(vitest)};
test('assertion',()=>expect(1).toBe(2));`,
    'assertion'
  );
  expect(isTimeoutOnlyFile(assertion.report.files[0])).toBe(false);
  await expect(
    fixtureRun(root, 'throw new Error("collection failure");', 'collection')
  ).rejects.toThrow();
}, 20000);

it.each([
  { code: 2, signal: null, killed: false },
  { code: 1, signal: 'SIGTERM', killed: false },
  { code: 1, signal: null, killed: true },
  { code: 1 },
  null,
])('rejects unsafe child outcomes: %j', (outcome) => {
  expect(isExpectedFailedRun(outcome)).toBe(false);
});
