import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, expect, it } from 'vitest';

import {
  collectInterfaceSurfaceViolations,
  runInterfaceSurfaceCheck,
} from './verify-interface-surfaces.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createInterface(name: string, memberCount: number) {
  const members = Array.from({ length: memberCount }, (_, index) => `  field${index}: string;`);
  return [`export interface ${name} {`, ...members, '}', ''].join('\n');
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags newly introduced broad param bags', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/app/message-bridge/types.ts',
    createInterface('RuntimeMessageBridgeParams', 21)
  );

  expect(
    collectInterfaceSurfaceViolations([file], {
      getPreviousSource: () => null,
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'interface-surface-breadth',
      file: expect.stringContaining(
        'apps/extension/src/content/overlay/app/message-bridge/types.ts'
      ),
    }),
  ]);
});

it('reports existing broad surfaces in repo-wide mode even on a clean tree', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/app/message-bridge/types.ts',
    createInterface('RuntimeMessageBridgeParams', 21)
  );

  expect(runInterfaceSurfaceCheck({ files: [file], scope: 'repo-wide' }).violations).toEqual([
    expect.objectContaining({
      rule: 'interface-surface-breadth',
      file: expect.stringContaining(
        'apps/extension/src/content/overlay/app/message-bridge/types.ts'
      ),
    }),
  ]);
});

it('provides a repo-wide runner for full verify wiring', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  writeFile(root, 'package.json', '{"name":"verify-interface-surfaces-temp"}\n');
  writeFile(
    root,
    'apps/extension/src/content/overlay/app/message-bridge/types.ts',
    createInterface('RuntimeMessageBridgeParams', 21)
  );

  const result = JSON.parse(
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import { runRepoWideInterfaceSurfaceCheck } from ${JSON.stringify(
            path.join(process.cwd(), 'tooling/qa/core/verify-interface-surfaces.mjs')
          )};
          process.stdout.write(JSON.stringify(runRepoWideInterfaceSurfaceCheck()));
        `,
      ],
      {
        cwd: root,
        encoding: 'utf8',
      }
    )
  );

  expect(result).toEqual(
    expect.objectContaining({
      skipped: false,
      files: expect.arrayContaining([
        'apps/extension/src/content/overlay/app/message-bridge/types.ts',
      ]),
      violations: [
        expect.objectContaining({
          rule: 'interface-surface-breadth',
          file: 'apps/extension/src/content/overlay/app/message-bridge/types.ts',
        }),
      ],
    })
  );
});

it('allows legacy broad surfaces that did not grow in the current diff', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const source = createInterface('RuntimeMessageBridgeParams', 21);
  const file = writeFile(
    root,
    'apps/extension/src/content/overlay/app/message-bridge/types.ts',
    source
  );

  expect(
    collectInterfaceSurfaceViolations([file], {
      getPreviousSource: () => source,
    })
  ).toEqual([]);
});

it('flags widened existing broad surfaces', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-interface-surfaces-'));
  tempDirs.push(root);

  const file = writeFile(
    root,
    'apps/extension/src/video-editor/state/video-editor-store-types.ts',
    createInterface('VideoEditorState', 22)
  );

  expect(
    collectInterfaceSurfaceViolations([file], {
      getPreviousSource: () => createInterface('VideoEditorState', 21),
    })
  ).toEqual([
    expect.objectContaining({
      rule: 'interface-surface-breadth',
      file: expect.stringContaining(
        'apps/extension/src/video-editor/state/video-editor-store-types.ts'
      ),
    }),
  ]);
});

it('allows a stable real repo surface when the diff does not widen it', () => {
  const file = path.resolve('apps/extension/src/content/overlay/app/message-bridge/types.ts');
  const source = fs.readFileSync(file, 'utf8');

  expect(
    collectInterfaceSurfaceViolations([file], {
      getPreviousSource: () => source,
    })
  ).toEqual([]);
});
