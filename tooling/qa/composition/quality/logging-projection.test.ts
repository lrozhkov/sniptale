import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import {
  LOGGING_OXLINT_RULE,
  projectLoggingStepFromOxlint,
  parseNoConsoleDiagnostic,
  resolveLoggingTargets,
} from './logging-projection.mjs';

const tempDirs: string[] = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-logging-oxlint-'));
  tempDirs.push(root);
  return root;
}

function readOxlintConfig() {
  return JSON.parse(fs.readFileSync('.oxlintrc.json', 'utf8')) as {
    overrides: Array<{ files: string[]; rules: Record<string, string> }>;
  };
}

function findOverride(files: string[]) {
  return readOxlintConfig().overrides.find(
    (override) => JSON.stringify(override.files) === JSON.stringify(files)
  );
}

function runNativeNoConsole(source: string) {
  const root = createTempRoot();
  const sourcePath = path.join(root, 'fixture.ts');
  const configPath = path.join(root, '.oxlintrc.json');
  fs.writeFileSync(sourcePath, source);
  fs.writeFileSync(
    configPath,
    `${JSON.stringify({ rules: { [LOGGING_OXLINT_RULE]: 'error' } })}\n`
  );

  return spawnSync(
    path.resolve('node_modules/.bin/oxlint'),
    ['--config', configPath, '--deny-warnings', '--format', 'unix', sourcePath],
    { encoding: 'utf8' }
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('Oxlint logging policy ownership', () => {
  it('catches raw console smells, including methods outside the retired five-method heuristic', () => {
    const result = runNativeNoConsole(
      'export function report(value: unknown) { console.error(value); console.trace(value); }\n'
    );

    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain('no-console');
  });

  it('permits the nearby structured-logger shape', () => {
    const result = runNativeNoConsole(
      [
        "import { createLogger } from '@sniptale/platform/observability/logger';",
        "const logger = createLogger('fixture');",
        "export function report(value: unknown) { logger.error('failure', { value }); }",
        '',
      ].join('\n')
    );

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('owns the exact production scope and only the two tracing exemptions', () => {
    const production = findOverride([
      'apps/extension/src/**/*.{ts,tsx}',
      'packages/*/src/**/*.{ts,tsx}',
    ]);
    const tests = readOxlintConfig().overrides.find((override) =>
      override.files.includes('**/*.test.{ts,tsx,js,mjs,cjs}')
    );
    const tracingFiles = [
      'packages/platform/src/observability/message-tracer/console.ts',
      'packages/platform/src/observability/message-tracer/index.ts',
    ];
    const tracing = findOverride(tracingFiles);

    expect(production?.rules[LOGGING_OXLINT_RULE]).toBe('error');
    expect(tests?.rules[LOGGING_OXLINT_RULE]).toBe('off');
    expect(tracing?.rules[LOGGING_OXLINT_RULE]).toBe('off');
    expect(tracing?.files).toEqual(tracingFiles);
  });

  it('projects whole changed production files to the existing Oxlint invocation', () => {
    const files = [
      'apps/extension/src/content/logic/example.ts',
      'apps/extension/src/content/logic/example.test.ts',
      'tooling/qa/composition/quality/logging-projection.mjs',
    ];

    expect(resolveLoggingTargets({ files })).toEqual([
      'apps/extension/src/content/logic/example.ts',
    ]);
  });

  it('projects only no-console diagnostics from the single Oxlint receipt', () => {
    const files = ['apps/extension/src/content/logic/example.ts'];
    const noConsole = projectLoggingStepFromOxlint({
      files,
      step: {
        label: 'Oxlint',
        status: 'failed',
        stderr:
          'apps/extension/src/content/logic/example.ts:2:3: Unexpected console statement. [Error/eslint(no-console)]',
      },
    });
    expect(noConsole).toMatchObject({
      label: 'Logging policy',
      status: 'failed',
      violations: [{ rule: 'raw-console-logging', line: 2, column: 3 }],
    });

    expect(
      projectLoggingStepFromOxlint({
        files,
        step: {
          label: 'Oxlint',
          status: 'failed',
          stderr:
            'apps/extension/src/content/logic/example.ts:2:3: error: unrelated finding [no-debugger]',
        },
      })
    ).toMatchObject({ label: 'Logging policy', status: 'ok' });
  });

  it('parses the actual pinned Oxlint unix grammar and rejects malformed matching output', () => {
    const native = runNativeNoConsole('export function report() { console.error("x"); }\n');
    const diagnosticLine = `${native.stdout}${native.stderr}`
      .split(/\r?\n/u)
      .find((line) => line.includes('no-console'));

    expect(diagnosticLine).toBeDefined();
    expect(parseNoConsoleDiagnostic(diagnosticLine!)).toMatchObject({
      rule: 'raw-console-logging',
      line: 1,
      message: 'Unexpected console statement.',
    });
    expect(() =>
      parseNoConsoleDiagnostic('fixture.ts:1:2: broken [Unknown/eslint(no-console)]')
    ).toThrow('Malformed Oxlint no-console diagnostic');
  });

  it('projects a full-root Oxlint receipt from its expanded file scope', () => {
    expect(
      projectLoggingStepFromOxlint({
        files: ['apps/extension/src'],
        lintedFiles: ['apps/extension/src/content/logic/example.ts'],
        step: {
          label: 'Oxlint',
          status: 'failed',
          stderr:
            'apps/extension/src/content/logic/example.ts:2:3: Unexpected console statement. [Error/eslint(no-console)]',
        },
      })
    ).toMatchObject({ label: 'Logging policy', status: 'failed' });
  });

  it('keeps the logical projection skipped when the shared scope is empty', () => {
    expect(
      projectLoggingStepFromOxlint({
        files: ['tooling/qa/composition/quality/logging-projection.mjs'],
        step: { label: 'Oxlint', status: 'failed', stderr: 'unrelated' },
      })
    ).toMatchObject({ label: 'Logging policy', status: 'skipped' });
  });
});
