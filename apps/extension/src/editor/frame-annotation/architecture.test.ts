import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const extensionRoot = resolve(import.meta.dirname, '../..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory)
    .flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : [path];
    })
    .filter((path) => /\.(?:ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path));
}

it('keeps the shared owner independent from editor and content runtimes', () => {
  const sharedRoot = join(extensionRoot, 'features/highlighter/frame-annotation');
  const source = sourceFiles(sharedRoot)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  expect(source).not.toMatch(/(?:from|import\()\s*['"][^'"]*(?:\/editor\/|\/content\/)/);
});

it('keeps editor and content runtime imports independent in both directions', () => {
  function crossRuntimeImports(runtime: 'content' | 'editor', forbidden: 'content' | 'editor') {
    const forbiddenRoot = join(extensionRoot, forbidden);
    return sourceFiles(join(extensionRoot, runtime)).flatMap((path) => {
      const imports = readFileSync(path, 'utf8').matchAll(
        /(?:from\s*|import\()\s*['"]([^'"]+)['"]/gu
      );
      return [...imports]
        .map((match) => match[1] ?? '')
        .filter((specifier) => specifier.startsWith('.'))
        .map((specifier) => resolve(dirname(path), specifier))
        .filter((target) => target === forbiddenRoot || target.startsWith(`${forbiddenRoot}/`))
        .map((target) => `${relative(extensionRoot, path)} -> ${relative(extensionRoot, target)}`);
    });
  }
  expect(crossRuntimeImports('editor', 'content')).toEqual([]);
  expect(crossRuntimeImports('content', 'editor')).toEqual([]);
});

it('keeps SnapDOM isolated to the offscreen raster adapter', () => {
  const consumers = sourceFiles(extensionRoot)
    .filter((path) => readFileSync(path, 'utf8').includes("from '@zumer/snapdom'"))
    .map((path) => relative(extensionRoot, path));
  expect(consumers).toEqual(['offscreen/frame-annotation-rasterizer/index.tsx']);
});

it('keeps frame annotations distinct from the shared drawing and step types', () => {
  const types = readFileSync(join(extensionRoot, 'features/editor/document/types.ts'), 'utf8');
  for (const existing of ["'pencil'", "'marker'", "'shape'", "'text'", "'step'"]) {
    expect(types).toContain(existing);
  }
  expect(types).toContain("'frame-annotation'");

  const frameOwnerSource = sourceFiles(join(extensionRoot, 'editor/frame-annotation'))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  expect(frameOwnerSource).not.toMatch(
    /sniptaleType\s*=\s*['"](?:pencil|marker|shape|text|step)['"]/
  );

  const authoritativeTypeWriters = sourceFiles(join(extensionRoot, 'editor'))
    .filter((path) =>
      /sniptaleType\s*=\s*['"]frame-annotation['"]/.test(readFileSync(path, 'utf8'))
    )
    .map((path) => relative(extensionRoot, path));
  expect(authoritativeTypeWriters).toEqual(['editor/frame-annotation/proxy.ts']);
  expect(frameOwnerSource).not.toMatch(/(?:step|pencil|marker|shape|text).*frame-annotation\s*:/i);
});
