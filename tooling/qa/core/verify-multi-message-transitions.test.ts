import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { collectMultiMessageTransitionViolations } from './verify-multi-message-transitions.mjs';

const tempDirs: string[] = [];

function writeFile(root: string, relativePath: string, contents: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, contents);
  return absolutePath;
}

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-multi-message-transitions-'));
  tempDirs.push(root);
  return root;
}

function writePolicy(root: string, entries: unknown[] = []) {
  const policyPath = path.join(root, 'tooling/configs/qa/multi-message-orchestration.data.json');
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(policyPath, JSON.stringify({ allowedOwners: entries }, null, 2));
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

it('flags functions that chain multiple messaging calls', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/content/hooks/useScenarioController.actions.ts',
    [
      'export async function applyScenario() {',
      '  await sendRuntimeMessage("A");',
      '  await sendRuntimeMessage("B");',
      '}',
    ].join('\n')
  );

  expect(collectMultiMessageTransitionViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'multi-message-transitions',
      file: expect.stringContaining(
        'apps/extension/src/content/hooks/useScenarioController.actions.ts'
      ),
    }),
  ]);
});

it('allows single-message transitions', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/popup/shell/export/popup-export-runtime.actions.ts',
    ['export async function exportPopup() {', '  return sendRuntimeMessage("A");', '}'].join('\n')
  );

  expect(collectMultiMessageTransitionViolations([file], { rootDir: root })).toEqual([]);
});

it('ignores mutually exclusive branches that each perform only one message transition', () => {
  const root = createTempRoot();
  writePolicy(root);
  const file = writeFile(
    root,
    'apps/extension/src/editor/runtime/orchestration.ts',
    [
      'export async function orchestrateEditorRuntime(mode: string) {',
      '  if (mode === "embed") {',
      '    await sendRuntimeMessage("A");',
      '    return;',
      '  }',
      '  await sendRuntimeMessage("B");',
      '}',
    ].join('\n')
  );

  expect(collectMultiMessageTransitionViolations([file], { rootDir: root })).toEqual([]);
});

it('allows explicit orchestration owners from the registry', () => {
  const root = createTempRoot();
  writePolicy(root, [
    {
      file: 'apps/extension/src/editor/runtime/orchestration.ts',
      function: 'orchestrateEditorRuntime',
      owner: 'editor-runtime-orchestration',
      justification: 'This owner intentionally coordinates multiple runtime transitions.',
      reviewNote: 'Keep multi-message flows confined to this function.',
    },
  ]);
  const file = writeFile(
    root,
    'apps/extension/src/editor/runtime/orchestration.ts',
    [
      'export async function orchestrateEditorRuntime() {',
      '  await sendRuntimeMessage("A");',
      '  await sendRuntimeMessage("B");',
      '}',
    ].join('\n')
  );

  expect(collectMultiMessageTransitionViolations([file], { rootDir: root })).toEqual([]);
});

it('flags stale orchestration policy targets', () => {
  const root = createTempRoot();
  writePolicy(root, [
    {
      file: 'apps/extension/src/editor/runtime/missing.ts',
      function: 'orchestrateEditorRuntime',
      owner: 'editor-runtime-orchestration',
      justification: 'This owner intentionally coordinates multiple runtime transitions.',
      reviewNote: 'Keep multi-message flows confined to this function.',
    },
  ]);
  const file = writeFile(
    root,
    'apps/extension/src/editor/runtime/orchestration.ts',
    [
      'export async function orchestrateEditorRuntime() {',
      '  await sendRuntimeMessage("A");',
      '  await sendRuntimeMessage("B");',
      '}',
    ].join('\n')
  );

  expect(collectMultiMessageTransitionViolations([file], { rootDir: root })).toEqual([
    expect.objectContaining({
      rule: 'multi-message-orchestration-policy-missing-target',
      file: 'tooling/configs/qa/multi-message-orchestration.data.json',
    }),
    expect.objectContaining({
      rule: 'multi-message-transitions',
      file: expect.stringContaining('apps/extension/src/editor/runtime/orchestration.ts'),
    }),
  ]);
});
