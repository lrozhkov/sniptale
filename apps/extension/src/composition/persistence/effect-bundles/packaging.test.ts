import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { BuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
async function buildVideoEffectIndex(root: string): Promise<BuiltinEffectIndex> {
  const script =
    "import {buildVideoEffectIndex} from './apps/extension/build/video-effects.ts'; " +
    'console.log(JSON.stringify(await buildVideoEffectIndex(process.argv[1])));';
  const output = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e', script, root],
    { encoding: 'utf8' }
  );
  return JSON.parse(output);
}

import { parseBuiltinEffectIndex } from '../../../features/video/project/effect-bundle/catalog/builtin-index';
const root = resolve('apps/extension/public/video-effects');
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
it('packages only 21 valid product documents and a small graph-free catalog index', async () => {
  const index = await buildVideoEffectIndex(root);
  expect(parseBuiltinEffectIndex(index)).toEqual(index);
  expect(index.documents).toHaveLength(21);
  expect(index.documents.filter((d) => d.kind === 'standalone')).toHaveLength(6);
  expect(index.documents.filter((d) => d.kind === 'transition')).toHaveLength(6);
  expect(JSON.stringify(index)).not.toContain('"graph"');
  expect(JSON.stringify(index).length).toBeLessThan(35000);
});
it.each(['missing', 'digest', 'extra', 'unsafe'] as const)(
  'rejects %s package defects',
  async (mode) => {
    const dir = await mkdtemp(join(tmpdir(), 'sniptale-builtin-'));
    temporary.push(dir);
    await cp(root, dir, { recursive: true });
    const path = join(dir, 'collection.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    if (mode === 'missing') await rm(join(dir, manifest.effectDocuments[0].path));
    if (mode === 'digest') await writeFile(join(dir, manifest.effectDocuments[0].path), '{}');
    if (mode === 'extra') await writeFile(join(dir, 'workflow-corpus.json'), '{}');
    if (mode === 'unsafe') {
      manifest.effectDocuments[0].path = '../escape.json';
      await writeFile(path, JSON.stringify(manifest));
    }
    await expect(buildVideoEffectIndex(dir)).rejects.toThrow();
  }
);

it('rejects malformed lazy metadata before exposing catalog entries', async () => {
  const valid = await buildVideoEffectIndex(root);
  const invalid = [
    null,
    { ...valid, sourceSha256: 'bad' },
    { ...valid, manifest: {} },
    { ...valid, documents: [] },
  ];
  for (const input of invalid) expect(() => parseBuiltinEffectIndex(input)).toThrow();
  for (const patch of [
    { id: 'wrong' },
    { kind: 'unknown' },
    { presentation: null },
    { presentation: { ...valid.documents[0]!.presentation, label: { ru: 'Нет English' } } },
    { presentation: { ...valid.documents[0]!.presentation, controlPresets: {} } },
    { presentation: { ...valid.documents[0]!.presentation, controlPresets: [{ id: 'bad' }] } },
    { presentation: { ...valid.documents[0]!.presentation, defaultControlPresetId: 'missing' } },
  ]) {
    expect(() =>
      parseBuiltinEffectIndex({
        ...valid,
        documents: [{ ...valid.documents[0], ...patch }, ...valid.documents.slice(1)],
      })
    ).toThrow();
  }
});
