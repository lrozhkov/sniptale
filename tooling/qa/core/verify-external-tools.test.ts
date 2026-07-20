import fs from 'node:fs';
import path from 'node:path';

import { expect, it } from 'vitest';

import { createTempRoot, writeFile } from './test-helpers';

function writeCodeqlSarif(outputRoot, results) {
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(
    path.join(outputRoot, 'results.sarif'),
    JSON.stringify({
      version: '2.1.0',
      runs: [
        {
          results,
        },
      ],
    })
  );
}

function createCodeqlResult(ruleId, file, line) {
  return {
    ruleId,
    message: { text: 'example finding' },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: file },
          region: { startLine: line },
        },
      },
    ],
  };
}

it('filters repo-audit ast-grep files with canonical allowlists and test-like paths', async () => {
  const module = await import('../audits/ast-grep.mjs');
  const root = createTempRoot('verify-ast-grep-audit-');
  const files = [
    writeFile(root, 'packages/platform/src/browser/runtime.ts', 'chrome.runtime.getManifest();\n'),
    writeFile(
      root,
      'apps/extension/src/content/runtime.test.ts',
      'chrome.runtime.sendMessage({ type: "PING" });\n'
    ),
    writeFile(
      root,
      'apps/extension/src/content/parser.test.fixtures.ts',
      'window.history.pushState({}, "", "/fixture");\n'
    ),
    writeFile(
      root,
      'apps/extension/src/platform/runtime-messaging/index.ts',
      'chrome.runtime.sendMessage({ type: "PING" });\n'
    ),
    writeFile(
      root,
      'apps/extension/src/content/demo.ts',
      'chrome.runtime.sendMessage({ type: "PING" });\n'
    ),
  ];

  expect(module.filterAstGrepAuditFiles(files, undefined, { root })).toEqual([
    expect.stringContaining('apps/extension/src/content/demo.ts'),
  ]);
});

it('does not hide production files that merely contain test-like words', async () => {
  const { isExternalAuditTestLikeFile } = await import('../policy/index.mjs');

  expect(isExternalAuditTestLikeFile('apps/extension/src/content/contest.test.logic.ts')).toBe(
    false
  );
  expect(isExternalAuditTestLikeFile('apps/extension/src/content/fixture-loader.ts')).toBe(false);
  expect(isExternalAuditTestLikeFile('apps/extension/src/content/runtime.test.ts')).toBe(true);
  expect(isExternalAuditTestLikeFile('apps/extension/src/content/parser.test.fixtures.ts')).toBe(
    true
  );
  expect(isExternalAuditTestLikeFile('apps/extension/src/content/test-support/helper.ts')).toBe(
    true
  );
});

it('maps ast-grep findings to stable violation ids', async () => {
  const module = await import('../audits/ast-grep.mjs');
  const file = writeFile(
    createTempRoot('verify-ast-grep-'),
    'apps/extension/src/content/demo.ts',
    "chrome.runtime.sendMessage({ type: 'PING' });\n"
  );

  const result = module.runAstGrepCheck({
    files: [file],
    groupIds: ['messaging'],
    runCommandImpl: () => ({
      status: 0,
      stdout: JSON.stringify([
        {
          file,
          ruleId: 'messaging-direct-send-runtime',
          range: { start: { line: 0 } },
        },
      ]),
      stderr: '',
    }),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'messaging-direct-send',
      file: expect.stringContaining('apps/extension/src/content/demo.ts'),
      line: 1,
    }),
  ]);
});

it('batches repo-scoped ast-grep files into one scan', async () => {
  const module = await import('../audits/ast-grep.mjs');
  const calls = [];

  module.runAstGrepCheck({
    files: ['@sniptale/platform/browser/scripting', '@sniptale/platform/browser/tabs'],
    groupIds: ['browser-adapters'],
    runCommandImpl: (command, args, options) => {
      calls.push({ command, args, options });
      return {
        status: 0,
        stdout: '[]',
        stderr: '',
      };
    },
  });

  expect(calls).toHaveLength(1);
  expect(calls[0].options.cwd).toBe(process.cwd());
  expect(calls[0].args).toContain('@sniptale/platform/browser/scripting');
  expect(calls[0].args).toContain('@sniptale/platform/browser/tabs');
});

it('parses semgrep json findings', async () => {
  const module = await import('../audits/semgrep.mjs');
  const root = createTempRoot('verify-semgrep-report-');
  const reportPath = path.join(root, 'results.json');
  const result = module.runSemgrepCheck({
    files: ['apps/extension/src/composition/persistence/storage/example.ts'],
    commandSpec: {
      command: 'semgrep',
      args: [],
      env: { SEMGREP_SETTINGS_FILE: path.resolve('.tmp/semgrep/settings.yml') },
    },
    reportPath: 'results.json',
    reportRoot: root,
    runCommandImpl: () => ({
      status: 1,
      stdout: JSON.stringify({
        results: [
          {
            check_id: 'sniptale-secret-storage-local',
            path: 'apps/extension/src/composition/persistence/storage/example.ts',
            start: { line: 7 },
            extra: { message: 'secret-like storage write' },
          },
        ],
      }),
      stderr: '',
    }),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'sniptale-secret-storage-local',
      file: 'apps/extension/src/composition/persistence/storage/example.ts',
      line: 7,
    }),
  ]);
  expect(result.reportPath).toBe(reportPath);
  expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual({
    schemaVersion: 1,
    artifactKind: 'semgrep-results',
    findingCount: 1,
    findings: result.violations,
  });
});

it('fails closed on semgrep bootstrap exit status', async () => {
  const module = await import('../audits/semgrep.mjs');
  const root = createTempRoot('verify-semgrep-bootstrap-');
  expect(() =>
    module.runSemgrepCheck({
      files: ['apps/extension/src/composition/persistence/storage/example.ts'],
      commandSpec: {
        command: 'semgrep',
        args: [],
        env: { SEMGREP_SETTINGS_FILE: path.resolve('.tmp/semgrep/settings.yml') },
      },
      reportPath: 'results.json',
      reportRoot: root,
      runCommandImpl: () => ({
        status: 2,
        stdout: '',
        stderr: 'Could not parse HTTP_PROXY as a URL',
      }),
    })
  ).toThrow('undocumented exit status 2');
});

it('parses knip issue output', async () => {
  const module = await import('../audits/knip.mjs');
  const result = module.runKnipCheck({
    executable: 'knip',
    runCommandImpl: () => ({
      status: 1,
      stdout: JSON.stringify({
        issues: [
          {
            file: 'package.json',
            dependencies: [{ name: 'left-pad' }],
            unlisted: [],
            unresolved: [],
            exports: [],
            files: [],
            duplicates: [],
          },
        ],
      }),
      stderr: '',
    }),
  });

  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'knip-dependencies',
      file: 'package.json',
    }),
  ]);
});

it('parses codeql sarif output', async () => {
  const module = await import('../audits/codeql.mjs');
  const root = createTempRoot('verify-codeql-');
  const outputRoot = path.join(root, 'codeql');

  const calls = [];
  const result = module.runCodeqlCheck({
    baselinePath: null,
    executable: 'codeql',
    outputRoot,
    runCommandImpl: (command, args) => {
      calls.push([command, args]);
      if (args[1] === 'create') {
        return { status: 0, stdout: '', stderr: '' };
      }
      writeCodeqlSarif(outputRoot, [createCodeqlResult('js/example', 'src/example.ts', 5)]);
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  expect(calls).toHaveLength(2);
  expect(calls[1]?.[1]).toContain(module.CODEQL_STANDARD_SUITE);
  expect(calls[1]?.[1]).toEqual(
    expect.arrayContaining([expect.stringContaining(module.CODEQL_CUSTOM_SUITE_PATH)])
  );
  expect(result.violations).toEqual([
    expect.objectContaining({
      rule: 'js/example',
      file: 'src/example.ts',
      line: 5,
    }),
  ]);
});
