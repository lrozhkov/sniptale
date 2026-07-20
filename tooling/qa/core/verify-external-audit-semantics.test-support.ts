import fs from 'node:fs';
import path from 'node:path';

import { runCodeqlCheck } from '../audits/codeql.mjs';
import { runJscpdCheck } from '../audits/jscpd.mjs';
import { runKnipCheck } from '../audits/knip.mjs';
import { runSemgrepCheck } from '../audits/semgrep.mjs';
import { AUDIT_STEPS } from './qa-steps/definitions.data.mjs';
import { createTempRoot } from './test-helpers';
import { createSecuritySemanticCases } from './verify-external-audit-semantics.security.test-support';

const INTERNAL_AUDIT_CONTROL_IDS = new Set([
  'audit-evidence',
  'full-product-coverage',
  'topology-report',
]);

export function requiredExternalControlIds() {
  const profiles = JSON.parse(
    fs.readFileSync('tooling/configs/qa/audit-profiles.data.json', 'utf8')
  );
  const required = new Set(
    profiles.profiles.flatMap((profile) =>
      profile.controls.filter(({ requirement }) => requirement === 'required').map(({ id }) => id)
    )
  );
  return AUDIT_STEPS.map(([id]) => id)
    .filter((id) => required.has(id) && !INTERNAL_AUDIT_CONTROL_IDS.has(id))
    .sort();
}

function commandResult(status: number, stdout = '') {
  return { status, stderr: '', stdout };
}

function createKnipCase() {
  return {
    id: 'knip',
    run: () =>
      runKnipCheck({
        executable: 'knip',
        runCommandImpl: () =>
          commandResult(
            0,
            JSON.stringify({
              issues: [{ file: 'package.json', dependencies: [{ name: 'unused' }] }],
            })
          ),
      }),
  };
}

function createSemgrepCase(root: string) {
  const output = {
    results: [
      {
        check_id: 'sniptale-example',
        path: 'apps/extension/src/example.ts',
        start: { line: 1 },
        extra: { message: 'example finding' },
      },
    ],
  };
  return {
    id: 'semgrep',
    run: () =>
      runSemgrepCheck({
        commandSpec: {
          command: 'semgrep',
          args: [],
          env: { SEMGREP_SETTINGS_FILE: path.resolve('.tmp/semgrep/settings.yml') },
        },
        files: ['apps/extension/src/example.ts'],
        reportPath: 'semgrep.json',
        reportRoot: root,
        runCommandImpl: () => commandResult(0, JSON.stringify(output)),
      }),
  };
}

function createJscpdCase(root: string) {
  const reportPath = path.join(root, 'jscpd.json');
  const report = {
    duplicates: [
      {
        lines: 5,
        firstFile: { name: 'src/a.ts' },
        secondFile: { name: 'src/b.ts' },
      },
    ],
  };
  return {
    id: 'jscpd',
    run: () =>
      runJscpdCheck({
        baselinePath: null,
        executable: 'jscpd',
        reportPath,
        runCommandImpl: () => {
          fs.writeFileSync(reportPath, JSON.stringify(report));
          return commandResult(0);
        },
      }),
  };
}

function createCodeqlCase(root: string) {
  const outputRoot = path.join(root, 'codeql');
  return {
    id: 'codeql',
    run: () =>
      runCodeqlCheck({
        baselinePath: null,
        executable: 'codeql',
        outputRoot,
        runCommandImpl: (_command, args) => {
          if (args[1] === 'create') return commandResult(0);
          fs.mkdirSync(outputRoot, { recursive: true });
          fs.writeFileSync(
            path.join(outputRoot, 'results.sarif'),
            JSON.stringify({
              version: '2.1.0',
              runs: [{ results: [{ message: { text: 'missing identity and location' } }] }],
            })
          );
          return commandResult(0);
        },
      }),
  };
}

function createSemanticCases(root: string) {
  return [
    ...createSecuritySemanticCases(root),
    createKnipCase(),
    createSemgrepCase(root),
    createJscpdCase(root),
    createCodeqlCase(root),
  ];
}

export const semanticCases = createSemanticCases(createTempRoot('external-audit-semantics-'));
