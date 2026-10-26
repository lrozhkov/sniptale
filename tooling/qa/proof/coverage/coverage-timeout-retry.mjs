import fs from 'node:fs';
import path from 'node:path';
import istanbulCoverage from 'istanbul-lib-coverage';

import { runRepoNodeEntryAsync, runUnitTests } from '../unit/verify-unit-tests.mjs';
import { isTimeoutOnlyFile, parseUnitAttemptReport } from '../unit/unit-timeout-reporter.mjs';

const { createCoverageMap } = istanbulCoverage;
const REPORTER = 'tooling/qa/proof/unit/unit-timeout-reporter.mjs';
// Existing proof transport includes the HTML subtree and seals every report byte.
export const UNIT_ATTEMPTS_FILE = 'html/unit-attempts.json';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sameTests(first, second) {
  return (
    JSON.stringify(first.tests.map((test) => test.id).sort()) ===
      JSON.stringify(second.tests.map((test) => test.id).sort()) &&
    second.tests.some((test) => test.state === 'passed') &&
    first.tests
      .filter((test) => test.state !== 'skipped')
      .every((test) =>
        second.tests.some((retry) => retry.id === test.id && retry.state === 'passed')
      )
  );
}

function attemptExecutor({ cwd, directory, execute, retry }) {
  return (entry, args, options) =>
    execute(
      entry,
      [
        ...args.filter((arg) => arg !== '--passWithNoTests'),
        '--retry=0',
        '--reporter=default',
        `--reporter=${path.join(cwd, REPORTER)}`,
        '--coverage.reportOnFailure=true',
        `--coverage.reportsDirectory=${directory}`,
        ...(retry ? ['--isolate'] : []),
      ],
      {
        ...options,
        env: {
          ...options.env,
          SNIPTALE_UNIT_ATTEMPT_REPORT: path.join(directory, 'unit-attempt.json'),
        },
      }
    );
}

function readAttempt({ directory, expectedFiles, processResult, number, file }) {
  const report = parseUnitAttemptReport(
    readJson(path.join(directory, 'unit-attempt.json')),
    expectedFiles
  );
  if (
    processResult.signal ||
    ![0, 1].includes(processResult.status) ||
    (processResult.status === 0) !== (report.reason === 'passed')
  ) {
    throw new Error('Unit process outcome disagrees with terminal attempt evidence.');
  }
  return { number, file, process: processResult, report, directory };
}

function mergeCoverage(attempts, destination, cwd) {
  const merged = createCoverageMap({});
  for (const attempt of attempts) {
    const map = createCoverageMap(readJson(path.join(attempt.directory, 'coverage-final.json')));
    if (map.files().length === 0) throw new Error('Unit attempt coverage map is empty.');
    for (const file of map.files()) {
      const relative = path.relative(cwd, file);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error('Unit attempt coverage escapes the repository.');
      }
    }
    merged.merge(map);
  }
  fs.writeFileSync(destination, JSON.stringify(merged.toJSON()));
}

/** One full run may retry each timeout-only file once in a separate isolated process. */
export async function runCoverageWithTimeoutRetry({
  cwd = process.cwd(),
  maxWorkers,
  pool,
  expectedInputDigest,
  getInputDigest,
  execute = runRepoNodeEntryAsync,
}) {
  const root = path.join(cwd, '.tmp/coverage/unit');
  const attempts = [];
  const assertUnchanged = () => {
    if (getInputDigest() !== expectedInputDigest)
      throw new Error('Coverage inputs changed between attempts.');
  };
  const run = async (file, number) => {
    assertUnchanged();
    const directory = path.join(root, `attempt-${number}`);
    fs.mkdirSync(directory, { recursive: true });
    const processResult = await runUnitTests({
      cwd,
      coverage: true,
      coverageMode: 'manual',
      pool,
      suite: 'product',
      maxWorkers: file ? 1 : maxWorkers,
      ...(file ? { directFiles: [file], requireTests: true } : {}),
      execute: attemptExecutor({ cwd, directory, execute, retry: file !== null }),
    });
    const evidence = { number, file, process: processResult, directory };
    attempts.push(evidence);
    const completed = readAttempt({
      directory,
      expectedFiles: file ? [file] : null,
      processResult,
      number,
      file,
    });
    evidence.report = completed.report;
    assertUnchanged();
    return evidence;
  };
  try {
    const first = await run(null, 1);
    const failed = first.report.files.filter((file) => file.state === 'failed');
    const eligible = failed.filter((file) => isTimeoutOnlyFile(file));
    let blocked = failed.length !== eligible.length;
    for (const file of eligible) {
      const retry = await run(file.file, attempts.length + 1);
      if (!sameTests(file, retry.report.files[0]) || retry.report.reason !== 'passed')
        blocked = true;
    }
    if (blocked) throw new Error('Unit failures remain after the bounded timeout-only retry.');
    assertUnchanged();
    const reportPath = path.join(root, 'coverage-final.json');
    mergeCoverage(attempts, reportPath, cwd);
    return result(0, attempts, null, reportPath);
  } catch (error) {
    return result(1, attempts, error instanceof Error ? error.message : String(error), null);
  }
}

function result(status, attempts, error, reportPath) {
  return {
    status,
    attempts,
    error,
    reportPath,
    passedOnAttempt2: status === 0 && attempts.length > 1,
    stdout: attempts
      .map((attempt) => {
        const label = attempt.file ? `attempt 2: ${attempt.file}` : 'attempt 1: full suite';
        return `[${label}]\n${attempt.process.stdout ?? ''}`;
      })
      .join('\n'),
    stderr:
      attempts.map((attempt) => attempt.process.stderr ?? '').join('\n') +
      (error ? `\n${error}\n` : ''),
  };
}

/** Sealed extras preserve the first failure and every terminal retry, including process output. */
export function writeUnitAttemptEvidence(result, directory) {
  if (result.status !== 0 || result.attempts.length === 0)
    throw new Error('Cannot publish failed unit attempts.');
  const receipt = {
    schemaVersion: 1,
    outcome: 'passed',
    passedOnAttempt2: result.passedOnAttempt2,
    attempts: result.attempts.map(({ directory: _directory, ...attempt }) => attempt),
  };
  const destination = path.join(directory, UNIT_ATTEMPTS_FILE);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(receipt));
}

export function readUnitAttemptEvidence(text) {
  const value = JSON.parse(text);
  if (
    value?.schemaVersion !== 1 ||
    value.outcome !== 'passed' ||
    typeof value.passedOnAttempt2 !== 'boolean' ||
    !Array.isArray(value.attempts) ||
    value.attempts.length === 0 ||
    value.passedOnAttempt2 !== value.attempts.length > 1
  ) {
    throw new Error('Malformed sealed unit attempt evidence.');
  }
  const first = value.attempts[0];
  for (const [index, attempt] of value.attempts.entries()) {
    const report = parseUnitAttemptReport(attempt.report, index === 0 ? null : [attempt.file]);
    if (
      attempt.number !== index + 1 ||
      !attempt.process ||
      attempt.process.signal ||
      typeof attempt.process.stdout !== 'string' ||
      typeof attempt.process.stderr !== 'string' ||
      ![0, 1].includes(attempt.process.status) ||
      (attempt.process.status === 0) !== (report.reason === 'passed') ||
      (index === 0 ? attempt.file !== null : report.reason !== 'passed')
    ) {
      throw new Error('Invalid sealed unit attempt outcome.');
    }
  }
  const failed = first.report.files.filter((file) => file.state === 'failed');
  if (
    failed.some((file) => !isTimeoutOnlyFile(file)) ||
    failed.length !== value.attempts.length - 1 ||
    failed.some((file) => {
      const retries = value.attempts.slice(1).filter((attempt) => attempt.file === file.file);
      return retries.length !== 1 || !sameTests(file, retries[0].report.files[0]);
    })
  ) {
    throw new Error('Sealed unit attempts do not resolve the original timeout files.');
  }
  return value;
}
