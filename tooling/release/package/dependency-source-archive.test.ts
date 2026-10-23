import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterEach, expect, it } from 'vitest';
import {
  createDependencySourceArchive,
  verifyDependencySourceArchive,
} from './dependency-source-archive.mjs';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

it('distributes complete deterministic source independently of the installer', async () => {
  const archive = await createDependencySourceArchive();
  const repeated = await createDependencySourceArchive();
  expect(repeated.contents).toEqual(archive.contents);
  const zip = await JSZip.loadAsync(archive.contents);
  const names = Object.keys(zip.files);
  expect(names).toHaveLength(5);
  for (const file of [
    'LICENSE',
    'README.md',
    'patch-manifest.json',
    'patch-payload.json.gz',
    'source.patch',
  ]) {
    expect(names.some((name) => name.endsWith(`/${file}`))).toBe(true);
  }
  expect(
    await zip.file(names.find((name) => name.endsWith('/README.md'))!)!.async('string')
  ).toContain(archive.url);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sniptale-source-archive-'));
  roots.push(root);
  await fs.writeFile(path.join(root, archive.file), archive.contents);
  await expect(verifyDependencySourceArchive(root)).resolves.toEqual({
    file: archive.file,
    sha256: archive.sha256,
  });
  await fs.appendFile(path.join(root, archive.file), 'tampered');
  await expect(verifyDependencySourceArchive(root)).rejects.toThrow('digest mismatch');
  await fs.rm(path.join(root, archive.file));
  await expect(verifyDependencySourceArchive(root)).rejects.toThrow();
}, 15000);
