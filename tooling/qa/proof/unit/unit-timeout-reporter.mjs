import fs from 'node:fs';
import path from 'node:path';

const TERMINAL = new Set(['passed', 'failed', 'skipped']);
// Separate the optional suffix so neither pattern nests repetitions.
const TIMEOUT = new RegExp(
  '^(Test|Hook) timed out in ([1-9]\\d*)ms\\.\\n\
If this is a long-running (test|hook), pass a timeout value as the last argument \
or configure it globally with "(testTimeout|hookTimeout)"\\.$',
  'u'
);

const WAITING_TIMEOUT = new RegExp(
  '^(Test|Hook) timed out in ([1-9]\\d*)ms while waiting for [^\\n]+\\.\\n\
If this is a long-running (test|hook), pass a timeout value as the last argument \
or configure it globally with "(testTimeout|hookTimeout)"\\.$',
  'u'
);

function errorRecord(error) {
  return {
    name: typeof error?.name === 'string' ? error.name : '',
    message: typeof error?.message === 'string' ? error.message : '',
    stack: typeof error?.stack === 'string' ? error.stack : null,
    assertion:
      error?.actual !== undefined || error?.expected !== undefined || error?.diff !== undefined,
  };
}

function relativeFile(root, file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

/** Captures terminal public Vitest entities without interpreting console output. */
export default class UnitTimeoutReporter {
  onInit(context) {
    this.root = context.config.root;
    this.testTimeout = context.config.testTimeout;
    this.hookTimeout = context.config.hookTimeout;
  }

  onTestRunStart(specifications) {
    this.expectedFiles = specifications.map((specification) =>
      relativeFile(this.root, specification.moduleId)
    );
  }

  onProcessTimeout() {
    this.processTimeout = true;
  }

  onTestRunEnd(modules, unhandledErrors, reason) {
    const report = {
      schemaVersion: 1,
      reason,
      processTimeout: this.processTimeout === true,
      expectedFiles: this.expectedFiles ?? [],
      unhandledErrors: unhandledErrors.map(errorRecord),
      files: modules.map((module) => ({
        file: relativeFile(this.root, module.moduleId),
        state: module.state(),
        errors: module.errors().map(errorRecord),
        suiteErrors: [...module.children.allSuites()].flatMap((suite) =>
          suite.errors().map(errorRecord)
        ),
        tests: [...module.children.allTests()].map((test) => ({
          id: test.id,
          name: test.fullName,
          state: test.result().state,
          errors: (test.result().errors ?? []).map(errorRecord),
          timeout: test.options.timeout ?? this.testTimeout,
          retries: test.diagnostic()?.retryCount ?? (test.result().state === 'skipped' ? 0 : -1),
        })),
      })),
      hookTimeout: this.hookTimeout,
    };
    const destination = process.env.SNIPTALE_UNIT_ATTEMPT_REPORT;
    if (!destination) throw new Error('Unit attempt report destination is missing.');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(`${destination}.tmp`, JSON.stringify(report));
    fs.renameSync(`${destination}.tmp`, destination);
  }
}

function validErrors(errors) {
  return (
    Array.isArray(errors) &&
    errors.every(
      (error) =>
        error &&
        typeof error.name === 'string' &&
        typeof error.message === 'string' &&
        (error.stack === null || typeof error.stack === 'string') &&
        typeof error.assertion === 'boolean'
    )
  );
}

function validFile(file) {
  return (
    typeof file === 'string' &&
    file.length > 0 &&
    !path.isAbsolute(file) &&
    !file.split('/').some((part) => part === '..') &&
    !file.startsWith('-')
  );
}

function sameFiles(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

/** Refuses incomplete, empty, unknown, or internally retried execution evidence. */
export function parseUnitAttemptReport(value, expectedFiles = null) {
  if (
    value?.schemaVersion !== 1 ||
    !['passed', 'failed'].includes(value.reason) ||
    value.processTimeout !== false ||
    !Array.isArray(value.expectedFiles) ||
    value.expectedFiles.length === 0 ||
    !value.expectedFiles.every(validFile) ||
    new Set(value.expectedFiles).size !== value.expectedFiles.length ||
    !Array.isArray(value.files) ||
    !validErrors(value.unhandledErrors) ||
    value.unhandledErrors.length !== 0 ||
    !Number.isFinite(value.hookTimeout) ||
    value.hookTimeout < 0 ||
    !sameFiles(
      value.expectedFiles,
      value.files.map((file) => file?.file)
    ) ||
    (expectedFiles !== null && !sameFiles(expectedFiles, value.expectedFiles))
  ) {
    throw new Error('Missing, incomplete, or unsafe unit attempt report.');
  }
  for (const file of value.files) {
    if (
      !TERMINAL.has(file.state) ||
      !validErrors(file.errors) ||
      !validErrors(file.suiteErrors) ||
      !Array.isArray(file.tests) ||
      file.tests.length === 0 ||
      file.tests.some(
        (test) =>
          !test ||
          typeof test.id !== 'string' ||
          test.id.length === 0 ||
          typeof test.name !== 'string' ||
          !TERMINAL.has(test.state) ||
          !validErrors(test.errors) ||
          !Number.isFinite(test.timeout) ||
          test.timeout < 0 ||
          test.retries !== 0 ||
          (test.state === 'failed' && test.errors.length === 0) ||
          (test.state !== 'failed' && test.errors.length !== 0)
      ) ||
      new Set(file.tests.map((test) => test.id)).size !== file.tests.length
    ) {
      throw new Error('Invalid terminal unit file evidence.');
    }
    const failed =
      file.errors.length +
        file.suiteErrors.length +
        file.tests.filter((test) => test.state === 'failed').length >
      0;
    if ((file.state === 'failed') !== failed)
      throw new Error('Unit file outcome disagrees with its failures.');
  }
  if ((value.reason === 'failed') !== value.files.some((file) => file.state === 'failed')) {
    throw new Error('Unit run outcome disagrees with its files.');
  }
  return value;
}

function exactTimeout(error, testTimeout) {
  if (error.name !== 'Error' || error.assertion) return false;
  const match = TIMEOUT.exec(error.message) ?? WAITING_TIMEOUT.exec(error.message);
  if (!match) return false;
  const hook = match[1] === 'Hook';
  return (
    match[3] === (hook ? 'hook' : 'test') &&
    match[4] === (hook ? 'hookTimeout' : 'testTimeout') &&
    (hook || Number(match[2]) === testTimeout)
  );
}

/** Every actual failure must match the complete Vitest timeout contract. Hook overrides are public only in the error. */
export function isTimeoutOnlyFile(file) {
  if (file.state !== 'failed') return false;
  const suites = [...file.errors, ...file.suiteErrors];
  return (
    suites.every((error) => exactTimeout(error, null)) &&
    file.tests.every((test) => test.errors.every((error) => exactTimeout(error, test.timeout)))
  );
}
