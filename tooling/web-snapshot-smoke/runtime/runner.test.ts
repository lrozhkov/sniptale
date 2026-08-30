import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { createFixtureCandidateReceipt, withFixtureRuntimeWorkspace } from './runner.mjs';

const roots: string[] = [];

async function createRoot(name: string) {
  const root = join(tmpdir(), `${name}-${randomUUID()}`);
  roots.push(root);
  await mkdir(join(root, 'dist/assets'), { recursive: true });
  await writeFile(join(root, 'dist/manifest.json'), '{"manifest_version":3}\n');
  await writeFile(join(root, 'dist/assets/runtime.js'), 'export const candidate = 1;\n');
  return root;
}

async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('Web Snapshot fixture lifecycle smell contract', () => {
  it('clears stale result cases and removes both temporary runtime roots after success', async () => {
    const root = await createRoot('snapshot-smoke-success');
    const temporaryRoot = join(root, 'temporary');
    const resultRoot = join(root, '.tmp/web-snapshot-smoke/results');
    await mkdir(join(resultRoot, 'stale-case'), { recursive: true });
    await writeFile(join(resultRoot, 'stale-case/metrics.json'), '{}');
    await mkdir(temporaryRoot, { recursive: true });

    let runtimePaths: { unpackedDir: string; userDataDir: string } | null = null;
    await withFixtureRuntimeWorkspace({
      root,
      resultRoot,
      temporaryRoot,
      execute: async ({ unpackedDir, userDataDir }) => {
        runtimePaths = { unpackedDir, userDataDir };
        expect(await exists(join(resultRoot, 'stale-case'))).toBe(false);
        expect(await readFile(join(unpackedDir, 'manifest.json'), 'utf8')).toContain(
          'manifest_version'
        );
      },
    });

    expect(runtimePaths).not.toBeNull();
    expect(await exists(runtimePaths!.unpackedDir)).toBe(false);
    expect(await exists(runtimePaths!.userDataDir)).toBe(false);
  });

  it('removes both temporary runtime roots when fixture execution fails', async () => {
    const root = await createRoot('snapshot-smoke-failure');
    const temporaryRoot = join(root, 'temporary');
    const resultRoot = join(root, '.tmp/web-snapshot-smoke/results');
    await mkdir(temporaryRoot, { recursive: true });

    let runtimePaths: { unpackedDir: string; userDataDir: string } | null = null;
    await expect(
      withFixtureRuntimeWorkspace({
        root,
        resultRoot,
        temporaryRoot,
        execute: async ({ unpackedDir, userDataDir }) => {
          runtimePaths = { unpackedDir, userDataDir };
          throw new Error('fixture failed');
        },
      })
    ).rejects.toThrow('fixture failed');

    expect(runtimePaths).not.toBeNull();
    expect(await exists(runtimePaths!.unpackedDir)).toBe(false);
    expect(await exists(runtimePaths!.userDataDir)).toBe(false);
  });

  it('binds a non-vacuous receipt to exact selected cases and all candidate bytes', async () => {
    const root = await createRoot('snapshot-smoke-receipt');
    const receipt = await createFixtureCandidateReceipt({
      distRoot: join(root, 'dist'),
      selectedCaseNames: ['fixture'],
    });
    await writeFile(join(root, 'dist/assets/runtime.js'), 'export const candidate = 2;\n');
    const changedReceipt = await createFixtureCandidateReceipt({
      distRoot: join(root, 'dist'),
      selectedCaseNames: ['fixture'],
    });

    expect(receipt).toMatchObject({
      schemaVersion: 1,
      mode: 'fixtures',
      candidateFileCount: 2,
      selectedCases: ['fixture'],
    });
    expect(receipt.candidateDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(changedReceipt.candidateDigest).not.toBe(receipt.candidateDigest);
  });

  it('rejects empty candidate and case receipts instead of emitting vacuous evidence', async () => {
    const root = await createRoot('snapshot-smoke-empty-receipt');
    await expect(
      createFixtureCandidateReceipt({ distRoot: join(root, 'dist'), selectedCaseNames: [] })
    ).rejects.toThrow(/at least one selected case/u);
    await mkdir(join(root, 'empty-dist'));
    await expect(
      createFixtureCandidateReceipt({
        distRoot: join(root, 'empty-dist'),
        selectedCaseNames: ['fixture'],
      })
    ).rejects.toThrow(/non-empty dist/u);
  });
});
