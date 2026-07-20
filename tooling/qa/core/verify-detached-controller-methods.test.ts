import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import {
  collectDetachedControllerMethodViolations,
  runDetachedControllerMethodCheck,
} from './verify-detached-controller-methods.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-detached-controller-methods-'));
  tempDirs.push(root);
  return root;
}

function createRepoTempRoot() {
  const tempParent = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempParent, 'verify-detached-controller-methods-'));
  tempDirs.push(root);
  return root;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags raw ImageEditorController methods passed through object bags', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/sidebar-controller/builders.ts',
    [
      "import type { ImageEditorController } from '../../../lib/editor-controller';",
      "type Args = { controller: Pick<ImageEditorController, 'setActiveTool'> };",
      'export function buildArgs(args: Args) {',
      '  return { setActiveTool: args.controller.setActiveTool };',
      '}',
    ].join('\n')
  );

  expect(collectDetachedControllerMethodViolations([file])).toEqual([
    expect.objectContaining({
      file: expect.stringContaining(
        'apps/extension/src/editor/inspector/sidebar-controller/builders.ts'
      ),
      rule: 'detached-controller-method',
    }),
  ]);
});

it('allows wrapped raw controller methods and direct invocations', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/sidebar-controller/builders.ts',
    [
      "import type { ImageEditorController } from '../../../lib/editor-controller';",
      "type Args = { controller: Pick<ImageEditorController, 'setActiveTool'> };",
      'export function buildArgs(args: Args) {',
      '  args.controller.setActiveTool("select");',
      '  return { setActiveTool: (tool: "select") => args.controller.setActiveTool(tool) };',
      '}',
    ].join('\n')
  );

  expect(collectDetachedControllerMethodViolations([file])).toEqual([]);
});

it('detects local controllers returned from useEditorController', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/layers/actions.tsx',
    [
      "import { useEditorController } from '../../../controller-context';",
      'export function LayerActionRail() {',
      '  const controller = useEditorController();',
      '  return { onOpen: controller.selectLayer };',
      '}',
    ].join('\n')
  );

  expect(collectDetachedControllerMethodViolations([file])).toHaveLength(1);
});

it('flags inline raw controller container types', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/inspector/sidebar-controller/builders.ts',
    [
      "import type { useEditorController } from '../../../controller-context';",
      'export function buildArgs(args: { controller: ReturnType<typeof useEditorController> }) {',
      '  return { setActiveTool: args.controller.setActiveTool };',
      '}',
    ].join('\n')
  );

  expect(collectDetachedControllerMethodViolations([file])).toHaveLength(1);
});

it('keeps adapter-backed pass-through out of the blocking result', () => {
  const root = createTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/controller/public-api/scene-actions/index.ts',
    [
      "import type { EditorControllerPublicApiAdapter } from './types';",
      'export function buildArgs(controller: EditorControllerPublicApiAdapter) {',
      '  return { prepareObject: controller.prepareObject };',
      '}',
    ].join('\n')
  );

  expect(collectDetachedControllerMethodViolations([file])).toEqual([]);
});

it('reports adapter-backed pass-through as inventory in report-only mode', () => {
  const root = createRepoTempRoot();
  const file = writeFile(
    root,
    'apps/extension/src/editor/controller/public-api/scene-actions/index.ts',
    [
      "import type { EditorControllerPublicApiAdapter } from './types';",
      'export function buildArgs(controller: EditorControllerPublicApiAdapter) {',
      '  return { prepareObject: controller.prepareObject };',
      '}',
    ].join('\n')
  );
  const result = runDetachedControllerMethodCheck({
    collectFiles: () => [path.relative(process.cwd(), file)],
    includeAdapterInventory: true,
    scope: 'repo-wide',
  });

  expect(result.violations).toEqual([
    expect.objectContaining({ rule: 'adapter-controller-method-inventory' }),
  ]);
});
