import { mkdtemp, cp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { buildVideoEffectIndex } from './fixture.test-support';
import {
  parseBuiltinEffectIndex,
  parseBuiltinAnimationCollection,
  type BuiltinEffectIndex,
} from '../../../features/video/project/effect-bundle/catalog/builtin-index';
const root = resolve('apps/extension/public/video-effects');
const temporary: string[] = [];
let valid: BuiltinEffectIndex;
beforeAll(async () => {
  valid = await buildVideoEffectIndex(root);
});
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function copyCollection() {
  const dir = await mkdtemp(join(tmpdir(), 'sniptale-builtin-'));
  temporary.push(dir);
  await cp(root, dir, { recursive: true });
  return dir;
}
it('packages only ten checked Lottie documents and a small source-free catalog index', () => {
  expect(parseBuiltinEffectIndex(valid)).toEqual(valid);
  expect(valid.documents).toHaveLength(10);
  expect(valid.documents.every((document) => document.kind === 'standalone')).toBe(true);
  expect(JSON.stringify(valid)).not.toContain('"graph"');
  expect(JSON.stringify(valid)).not.toContain('"base64"');
  expect(JSON.stringify(valid).length).toBeLessThan(35000);
});
it.each(['missing', 'digest', 'extra', 'unsafe'] as const)(
  'rejects %s package defects',
  async (mode) => {
    const dir = await copyCollection(),
      manifest = structuredClone(valid.manifest);
    if (mode === 'missing') await rm(join(dir, manifest.documents[0]!.path));
    if (mode === 'digest') await writeFile(join(dir, manifest.documents[0]!.path), '{}');
    if (mode === 'extra') await writeFile(join(dir, 'workflow-corpus.json'), '{}');
    if (mode === 'unsafe') {
      manifest.documents[0]!.path = '../escape.json';
      await writeFile(join(dir, 'collection.json'), JSON.stringify(manifest));
    }
    await expect(buildVideoEffectIndex(dir)).rejects.toThrow();
  }
);
it('rejects malformed collection, lazy metadata and foreign schema before exposure', () => {
  for (const input of [
    null,
    { ...valid, sourceSha256: 'bad' },
    { ...valid, manifest: {} },
    { ...valid, documents: [] },
  ])
    expect(() => parseBuiltinEffectIndex(input)).toThrow();
  for (const patch of [
    { id: 'wrong' },
    { kind: 'transition' },
    { presentation: null },
    { presentation: { ...valid.documents[0]!.presentation, label: { ru: 'Нет English' } } },
    { presentation: { ...valid.documents[0]!.presentation, controlPresets: {} } },
    { presentation: { ...valid.documents[0]!.presentation, controlPresets: [{ id: 'bad' }] } },
    { presentation: { ...valid.documents[0]!.presentation, defaultControlPresetId: 'missing' } },
  ])
    expect(() =>
      parseBuiltinEffectIndex({
        ...valid,
        documents: [{ ...valid.documents[0], ...patch }, ...valid.documents.slice(1)],
      })
    ).toThrow();
  for (const patch of [
    { format: 'sniptale.bundle.v1' },
    { version: 2 },
    { foreign: true },
    { documents: [valid.manifest.documents[0], valid.manifest.documents[0]] },
    { notices: [{ path: 'unsafe.js', sha256: 'a'.repeat(64) }] },
  ])
    expect(() => parseBuiltinAnimationCollection({ ...valid.manifest, ...patch })).toThrow();
});
it('rejects changed document or notice bytes and undeclared or linked files', async () => {
  const dir = await copyCollection(),
    path = valid.manifest.notices[0]!.path;
  const original = await readFile(join(dir, path));
  await writeFile(join(dir, path), Buffer.concat([original, Buffer.from('drift')]));
  await expect(buildVideoEffectIndex(dir)).rejects.toThrow('notice integrity');
  await writeFile(join(dir, path), original);
  await symlink(join(dir, valid.manifest.documents[0]!.path), join(dir, 'linked.json'));
  await expect(buildVideoEffectIndex(dir)).rejects.toThrow('Symlink');
});
it('rejects embedded-resource substitution even with matching outer document and manifest hashes', async () => {
  const dir = await copyCollection(),
    manifest = structuredClone(valid.manifest),
    entry = manifest.documents[0]!;
  const document = JSON.parse(await readFile(join(dir, entry.path), 'utf8'));
  const bytes = Buffer.from(document.resources[0].base64, 'base64');
  bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
  document.resources[0].base64 = bytes.toString('base64');
  const source = Buffer.from(JSON.stringify(document));
  entry.byteLength = source.byteLength;
  entry.sha256 = createHash('sha256').update(source).digest('hex');
  await writeFile(join(dir, entry.path), source);
  await writeFile(join(dir, 'collection.json'), JSON.stringify(manifest));
  await expect(buildVideoEffectIndex(dir)).rejects.toThrow('Invalid builtin animation');
});
