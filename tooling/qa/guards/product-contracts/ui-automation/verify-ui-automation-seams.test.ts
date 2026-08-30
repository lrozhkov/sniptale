import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, expect, it } from 'vitest';

import { collectUiAutomationSeamViolations } from './verify-ui-automation-seams.mjs';

const tempDirs: string[] = [];
const CONTENT_APPLICATION_FILE = 'apps/extension/src/content/application/runtime.ts';

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
            path.join(
              process.cwd(),
              'tooling/qa/guards/product-contracts/ui-automation/verify-ui-automation-seams.mjs'
            )
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

it('flags synthetic keyboard automation anywhere in production content', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    CONTENT_APPLICATION_FILE,
    'document.dispatchEvent(new KeyboardEvent("keydown"));\n'
  );

  expect(collectUiAutomationSeamViolations([file])).toHaveLength(1);
});

it('flags qualified global and resolver-bound keyboard constructors', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    CONTENT_APPLICATION_FILE,
    [
      "import { resolveKeyboardEventConstructor as resolveEvent } from './dom-runtime';",
      'const KeyboardEventConstructor = resolveEvent(document);',
      'document.dispatchEvent(new window.KeyboardEvent("keydown"));',
      'document.dispatchEvent(new globalThis.KeyboardEvent("keydown"));',
      'document.dispatchEvent(new KeyboardEventConstructor!("keydown"));',
    ].join('\n')
  );

  expect(collectUiAutomationSeamViolations([file])).toHaveLength(3);
});

it('follows document-derived bindings without treating arbitrary click methods as DOM automation', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    CONTENT_APPLICATION_FILE,
    [
      'document.body.click();',
      'const button = document.querySelector("button");',
      'const alias = button;',
      'alias?.click();',
      'analytics.click();',
    ].join('\n')
  );

  expect(collectUiAutomationSeamViolations([file])).toEqual([
    expect.objectContaining({ line: 1, rule: 'ui-automation-seams' }),
    expect.objectContaining({ line: 4, rule: 'ui-automation-seams' }),
  ]);
});

it('ignores non-content production files and test-support sources', () => {
  const root = createTempRoot();
  const nonContentFile = writeFile(
    root,
    'apps/extension/src/background/runtime.ts',
    'document.body.click();\n'
  );
  const testSupportFile = writeFile(
    root,
    'apps/extension/src/content/runtime.test-support.ts',
    'document.body.click(); new KeyboardEvent("keydown");\n'
  );

  expect(collectUiAutomationSeamViolations([nonContentFile, testSupportFile])).toEqual([]);
});

it('does not confuse locally shadowed browser primitive names with automation', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    CONTENT_APPLICATION_FILE,
    [
      'const document = makeDocumentAdapter();',
      'class KeyboardEvent {}',
      'document.body.click();',
      'new KeyboardEvent();',
    ].join('\n')
  );

  expect(collectUiAutomationSeamViolations([file])).toEqual([]);
});

it('allows direct DOM clicks only in the exact host-page-click owner folder', () => {
  const root = createTempRoot();
  const owner = writeFile(
    root,
    'apps/extension/src/content/parser/host-page-click/index.ts',
    'export function click(element: HTMLElement) { element.click(); }\n'
  );
  const adjacent = writeFile(
    root,
    'apps/extension/src/content/parser/host-page-clicker/index.ts',
    'export function click(element: HTMLElement) { element.click(); }\n'
  );

  expect(collectUiAutomationSeamViolations([owner])).toEqual([]);
  expect(collectUiAutomationSeamViolations([adjacent])).toEqual([
    expect.objectContaining({ rule: 'ui-automation-seams' }),
  ]);
});

it('allows resolver-bound keyboard construction only in popup-export DOM-driver owners', () => {
  const root = createTempRoot();
  const source = [
    "import { resolveKeyboardEventConstructor } from './dom-runtime';",
    'const EventConstructor = resolveKeyboardEventConstructor(document);',
    'new EventConstructor!("keydown");',
  ].join('\n');
  const owner = writeFile(
    root,
    'apps/extension/src/content/parser/popup-export/dom-driver.ts',
    source
  );
  const adjacent = writeFile(
    root,
    'apps/extension/src/content/parser/popup-export/controller/dom-driver.ts',
    source
  );

  expect(collectUiAutomationSeamViolations([owner])).toEqual([]);
  expect(collectUiAutomationSeamViolations([adjacent])).toEqual([
    expect.objectContaining({ rule: 'ui-automation-seams' }),
  ]);
});

it('keeps the current host-page-click and popup-export sinks non-vacuous', () => {
  const root = createTempRoot();
  const hostPageClickSource = fs.readFileSync(
    path.join(process.cwd(), 'apps/extension/src/content/parser/host-page-click/index.ts'),
    'utf8'
  );
  const popupExportDriverSource = fs.readFileSync(
    path.join(process.cwd(), 'apps/extension/src/content/parser/popup-export/dom-driver.ts'),
    'utf8'
  );
  const movedHostOwner = writeFile(
    root,
    'apps/extension/src/content/parser/host-page-click-adjacent/index.ts',
    hostPageClickSource
  );
  const movedPopupOwner = writeFile(
    root,
    'apps/extension/src/content/parser/popup-export/dom-driver-adjacent.ts',
    popupExportDriverSource
  );

  expect(collectUiAutomationSeamViolations([movedHostOwner])).toEqual([
    expect.objectContaining({ rule: 'ui-automation-seams' }),
  ]);
  expect(collectUiAutomationSeamViolations([movedPopupOwner])).toEqual([
    expect.objectContaining({ rule: 'ui-automation-seams' }),
  ]);
});

it('does not classify timers as UI automation without an accepted invariant', () => {
  const root = createTempRoot();
  const file = writeFile(root, CONTENT_APPLICATION_FILE, 'globalThis.setTimeout(run, 10);\n');

  expect(collectUiAutomationSeamViolations([file])).toEqual([]);
});

it('provides a changed-file runner for focused and full verify wiring', () => {
  const root = createTempRoot();
  writeFile(root, 'package.json', '{"name":"verify-ui-automation-seams-temp"}\n');
  writeFile(root, CONTENT_APPLICATION_FILE, 'export const value = 1;\n');

  runGit(root, 'init');
  runGit(root, 'config', 'user.name', 'Test User');
  runGit(root, 'config', 'user.email', 'test@example.com');
  runGit(root, 'add', 'package.json', CONTENT_APPLICATION_FILE);
  runGit(root, 'commit', '-m', 'init');

  writeFile(root, CONTENT_APPLICATION_FILE, 'document.body.click();\n');
  const result = runChangedCheck(root);

  expect(result).toEqual(
    expect.objectContaining({
      skipped: false,
      files: expect.arrayContaining([CONTENT_APPLICATION_FILE]),
      violations: [
        expect.objectContaining({
          rule: 'ui-automation-seams',
          file: CONTENT_APPLICATION_FILE,
        }),
      ],
    })
  );
});
