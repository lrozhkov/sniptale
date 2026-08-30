import fs from 'node:fs';
import path from 'node:path';

import { runCodeqlCheck } from '../../codeql/codeql.mjs';
import { runJscpdCheck } from '../../jscpd/check.mjs';
import { runKnipCheck } from '../../knip/knip.mjs';
import { AUDIT_STEPS } from '../../../composition/catalog/definitions.data.mjs';
import { createTempRoot } from '../../../test-support/test-helpers';
import { createSecuritySemanticCases } from './security';

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

function createJscpdCase(root: string) {
  const reportPath = path.join(root, 'jscpd.json');
  return {
    id: 'jscpd',
    run: () =>
      runJscpdCheck({
        baselinePath: null,
        executable: 'jscpd',
        reportPath,
        runCommandImpl: () => {
          fs.writeFileSync(
            reportPath,
            JSON.stringify({
              duplicates: [
                {
                  format: 'typescript',
                  lines: 5,
                  tokens: 60,
                  firstFile: {
                    name: 'src/a.ts',
                    start: 1,
                    end: 5,
                    startLoc: { line: 1, column: 0, position: 0 },
                    endLoc: { line: 5, column: 1, position: 50 },
                  },
                  secondFile: {
                    name: 'src/b.ts',
                    start: 1,
                    end: 5,
                    startLoc: { line: 1, column: 0, position: 0 },
                    endLoc: { line: 5, column: 1, position: 50 },
                  },
                },
              ],
              statistics: { formats: {}, total: { sources: 2, clones: 1 } },
            })
          );
          return commandResult(1);
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
    createJscpdCase(root),
    createCodeqlCase(root),
  ];
}

export const semanticCases = createSemanticCases(createTempRoot('external-audit-semantics-'));
