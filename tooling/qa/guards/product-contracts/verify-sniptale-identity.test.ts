import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import JSZip from 'jszip';
import { afterEach, expect, it, vi } from 'vitest';

import { loadBoundedIdentityArchive } from '../../policy/retired/retired-identity-archive.mjs';
import { runSniptaleIdentityCheck } from './verify-sniptale-identity.mjs';

const roots: string[] = [];
const retiredProducts = [
  ['scr', 'een', 'yx'].join(''),
  ['smart', 'capture'].join(''),
  ['ns', 'mp'].join(''),
  ['s', 'cx'].join(''),
];
const retiredEffects = ['-', '.', '_', ' ', ''].map(
  (separator) => `${['eff', 'ect'].join('')}${separator}${['v', '4'].join('')}`
);

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function mockArchiveEntries(
  entries: Array<{ compressedSize?: number; dir?: boolean; uncompressedSize?: number }>
) {
  vi.spyOn(JSZip, 'loadAsync').mockResolvedValue({
    files: Object.fromEntries(
      entries.map((entry, index) => [
        `entry-${index}`,
        {
          _data: {
            compressedSize: entry.compressedSize,
            uncompressedSize: entry.uncompressedSize,
          },
          async: async () => new Uint8Array(),
          dir: entry.dir ?? false,
          name: `entry-${index}`,
        },
      ])
    ),
  } as never);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sniptale-identity-'));
  roots.push(root);
  return root;
}

function write(root: string, path: string, contents: string | Buffer) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
}

it('accepts clean paths, UTF-8 content and ZIP payloads', async () => {
  const root = fixture();
  const zip = new JSZip();
  zip.file('effects/clean.json', JSON.stringify({ schema: 'sniptale.effect.v1' }));
  write(root, 'fixtures/clean.zip', await zip.generateAsync({ type: 'nodebuffer' }));
  write(root, 'src/identity.ts', `export const product = 'Sniptale';\n`);

  await expect(
    runSniptaleIdentityCheck({ root, paths: ['fixtures/clean.zip', 'src/identity.ts'] })
  ).resolves.toEqual({ violations: [] });
});

it('adapts focused absolute files to the identity paths contract', async () => {
  const root = fixture();
  write(root, 'src/identity.ts', `export const product = '${retiredProducts[0]}';\n`);

  await expect(
    runSniptaleIdentityCheck({ root, files: [join(root, 'src/identity.ts')] })
  ).resolves.toEqual({ violations: [expect.stringContaining('retired product root')] });
});

it('skips missing paths and directories while scanning symlink identity text', async () => {
  const root = fixture();
  mkdirSync(join(root, 'src'), { recursive: true });
  symlinkSync(`../${retiredProducts[0]}`, join(root, 'src/product-link'));

  await expect(
    runSniptaleIdentityCheck({
      root,
      paths: ['missing.ts', 'src', 'src/product-link'],
    })
  ).resolves.toEqual({ violations: [expect.stringContaining('retired product root')] });
});

it('rejects every retired product root and Effect public version spelling', async () => {
  const root = fixture();
  const paths = retiredProducts.map((product, index) => {
    const path = `src/legacy-${index}.ts`;
    write(root, path, `export const product = '${product}';\n`);
    return path;
  });
  for (const [index, effect] of retiredEffects.entries()) {
    const path = `src/effect-${index}.ts`;
    write(root, path, `export const schema = '${effect}';\n`);
    paths.push(path);
  }

  const { violations } = await runSniptaleIdentityCheck({ root, paths });
  for (let index = 0; index < retiredProducts.length; index += 1) {
    expect(violations).toContainEqual(expect.stringContaining(`retired product root ${index + 1}`));
  }
  expect(
    violations.filter((violation) => violation.includes('retired Effect public version'))
  ).toHaveLength(retiredEffects.length);
});

it('rejects standalone retired Effect versions only inside EffectV1 runtime owners', async () => {
  const root = fixture();
  const retiredVersion = ['v', '4'].join('');
  const contractPath = 'packages/runtime-contracts/src/effect-v1/validation.ts';
  const interpreterPath =
    'apps/extension/src/effect-runtime-sandbox/worker/interpreter/expression.ts';
  const unrelatedPath = 'packages/platform/src/network-version.ts';
  write(root, contractPath, `export const message = 'Unsupported ${retiredVersion} expression';\n`);
  write(root, interpreterPath, `export const message = '${retiredVersion} never reorders';\n`);
  write(
    root,
    unrelatedPath,
    `export const protocol = 'IPv${retiredVersion.at(-1)}'; export const score = 'CVSS${retiredVersion}';\n`
  );

  await expect(
    runSniptaleIdentityCheck({ root, paths: [contractPath, interpreterPath] })
  ).resolves.toEqual({
    violations: [
      expect.stringContaining('retired standalone Effect version'),
      expect.stringContaining('retired standalone Effect version'),
    ],
  });
  await expect(runSniptaleIdentityCheck({ root, paths: [unrelatedPath] })).resolves.toEqual({
    violations: [],
  });
});

it('rejects retired identities in ZIP entry names and text payloads', async () => {
  const root = fixture();
  const zip = new JSZip();
  zip.file(`effects/${retiredProducts[0]}.json`, '{}');
  zip.file('effects/payload.json', JSON.stringify({ schema: retiredEffects[0] }));
  write(root, 'fixtures/archive.zip', await zip.generateAsync({ type: 'nodebuffer' }));

  await expect(
    runSniptaleIdentityCheck({ root, paths: ['fixtures/archive.zip'] })
  ).resolves.toEqual({
    violations: expect.arrayContaining([
      expect.stringContaining('retired product root'),
      expect.stringContaining('retired Effect public version'),
    ]),
  });
});

it('rejects a high-ratio ZIP in the isolated archive worker before expansion', async () => {
  const root = fixture();
  const zip = new JSZip();
  zip.file('fixtures/repeated.bin', Buffer.alloc(9 * 1024 * 1024));
  write(
    root,
    'fixtures/high-ratio.zip',
    await zip.generateAsync({ compression: 'DEFLATE', type: 'nodebuffer' })
  );

  await expect(
    runSniptaleIdentityCheck({ root, paths: ['fixtures/high-ratio.zip'] })
  ).resolves.toEqual({
    violations: [expect.stringContaining('archive per-entry size limit exceeded')],
  });
});

it('rejects compressed archives before parser admission', async () => {
  await expect(loadBoundedIdentityArchive(Buffer.alloc(64 * 1024 * 1024 + 1))).rejects.toThrow(
    'archive compressed-size limit exceeded'
  );
});

it('rejects excessive archive entry populations', async () => {
  mockArchiveEntries(
    Array.from({ length: 4_097 }, () => ({
      compressedSize: 0,
      dir: true,
      uncompressedSize: 0,
    }))
  );
  await expect(loadBoundedIdentityArchive(Buffer.alloc(1))).rejects.toThrow(
    'archive entry-count limit exceeded'
  );
});

it.each([
  ['invalid metadata', {}, 'archive entry size metadata is invalid'],
  [
    'per-entry inflation',
    { compressedSize: 8 * 1024 * 1024 + 1, uncompressedSize: 8 * 1024 * 1024 + 1 },
    'archive per-entry size limit exceeded',
  ],
  [
    'compression ratio',
    { compressedSize: 1, uncompressedSize: 201 },
    'archive compression-ratio limit exceeded',
  ],
] as const)('rejects %s before payload decoding', async (_label, entry, message) => {
  mockArchiveEntries([entry]);
  await expect(loadBoundedIdentityArchive(Buffer.alloc(1))).rejects.toThrow(message);
});

it('rejects aggregate archive inflation before payload decoding', async () => {
  mockArchiveEntries(
    Array.from({ length: 9 }, () => ({
      compressedSize: 8 * 1024 * 1024,
      uncompressedSize: 8 * 1024 * 1024,
    }))
  );
  await expect(loadBoundedIdentityArchive(Buffer.alloc(1))).rejects.toThrow(
    'archive aggregate size limit exceeded'
  );
});
