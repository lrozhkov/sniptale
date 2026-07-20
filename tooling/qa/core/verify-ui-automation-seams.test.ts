import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, expect, it } from 'vitest';

import { collectUiAutomationSeamViolations } from './verify-ui-automation-seams.mjs';

const tempDirs: string[] = [];
const FRAME_RUNTIME_REACT_FILE =
  'apps/extension/src/content/selection/frame-runtime/react/runtime.ts';

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-ui-automation-seams-'));
  tempDirs.push(root);
  return root;
}

function runGit(root: string, ...args: string[]) {
  execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: root,
    stdio: 'ignore',
  });
}

function runChangedCheck(root: string) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import { runChangedUiAutomationSeamCheck } from ${JSON.stringify(
            path.join(process.cwd(), 'tooling/qa/core/verify-ui-automation-seams.mjs')
          )};
          process.stdout.write(JSON.stringify(runChangedUiAutomationSeamCheck()));
        `,
      ],
      { cwd: root, encoding: 'utf8' }
    )
  );
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags delay and synthetic keyboard automation in export helpers', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/content/parser/export-manager/file-modal-utils.ts',
    ['setTimeout(() => {}, 10);', 'document.dispatchEvent(new KeyboardEvent("keydown"));'].join(
      '\n'
    )
  );

  expect(collectUiAutomationSeamViolations([file])).toHaveLength(2);
});

it('ignores non-targeted production files', () => {
  const root = createTempRoot();
  const file = writeFile(root, 'src/shared/logger.ts', 'setTimeout(() => {}, 10);\n');

  expect(collectUiAutomationSeamViolations([file])).toEqual([]);
});

it('provides a changed-file runner for focused and full verify wiring', () => {
  const root = createTempRoot();
  writeFile(root, 'package.json', '{"name":"verify-ui-automation-seams-temp"}\n');
  writeFile(root, FRAME_RUNTIME_REACT_FILE, 'export const value = 1;\n');

  runGit(root, 'init');
  runGit(root, 'config', 'user.name', 'Test User');
  runGit(root, 'config', 'user.email', 'test@example.com');
  runGit(root, 'add', 'package.json', FRAME_RUNTIME_REACT_FILE);
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, FRAME_RUNTIME_REACT_FILE, 'setTimeout(() => {}, 10);\n');
  const result = runChangedCheck(root);

  expect(result).toEqual(
    expect.objectContaining({
      skipped: false,
      files: expect.arrayContaining([FRAME_RUNTIME_REACT_FILE]),
      violations: [
        expect.objectContaining({
          rule: 'ui-automation-seams',
          file: FRAME_RUNTIME_REACT_FILE,
        }),
      ],
    })
  );
});
