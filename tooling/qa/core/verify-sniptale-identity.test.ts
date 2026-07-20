import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import JSZip from 'jszip';
import { afterEach, expect, it } from 'vitest';

import { sniptaleIdentityViolations } from './verify-sniptale-identity.mjs';

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
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

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

  expect(
    sniptaleIdentityViolations({ root, paths: ['fixtures/clean.zip', 'src/identity.ts'] })
  ).toEqual([]);
});

it('skips missing paths and directories while scanning symlink identity text', () => {
  const root = fixture();
  mkdirSync(join(root, 'src'), { recursive: true });
  symlinkSync(`../${retiredProducts[0]}`, join(root, 'src/product-link'));

  expect(
    sniptaleIdentityViolations({
      root,
      paths: ['missing.ts', 'src', 'src/product-link'],
    })
  ).toEqual([expect.stringContaining('retired product root')]);
});

it('rejects every retired product root and Effect public version spelling', () => {
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

  const violations = sniptaleIdentityViolations({ root, paths });
  for (let index = 0; index < retiredProducts.length; index += 1) {
    expect(violations).toContainEqual(expect.stringContaining(`retired product root ${index + 1}`));
  }
  expect(
    violations.filter((violation) => violation.includes('retired Effect public version'))
  ).toHaveLength(retiredEffects.length);
});

it('rejects standalone retired Effect versions only inside EffectV1 runtime owners', () => {
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

  expect(sniptaleIdentityViolations({ root, paths: [contractPath, interpreterPath] })).toEqual([
    expect.stringContaining('retired standalone Effect version'),
    expect.stringContaining('retired standalone Effect version'),
  ]);
  expect(sniptaleIdentityViolations({ root, paths: [unrelatedPath] })).toEqual([]);
});

it('rejects retired identities in ZIP entry names and text payloads', async () => {
  const root = fixture();
  const zip = new JSZip();
  zip.file(`effects/${retiredProducts[0]}.json`, '{}');
  zip.file('effects/payload.json', JSON.stringify({ schema: retiredEffects[0] }));
  write(root, 'fixtures/archive.zip', await zip.generateAsync({ type: 'nodebuffer' }));

  expect(sniptaleIdentityViolations({ root, paths: ['fixtures/archive.zip'] })).toEqual(
    expect.arrayContaining([
      expect.stringContaining('retired product root'),
      expect.stringContaining('retired Effect public version'),
    ])
  );
});
