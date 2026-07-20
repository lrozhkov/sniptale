import { expect, it } from 'vitest';

import { createTempRoot, importFresh, withCwd, writeFile } from './test-helpers';

async function collectViolations(root: string, files: string[]) {
  return withCwd(root, async () => {
    const module = await importFresh<typeof import('./verify-boundary-casts.mjs')>(
      './verify-boundary-casts.mjs',
      import.meta.url
    );
    return module.collectBoundaryCastViolations(files);
  });
}

it('flags product as-never casts outside tests', async () => {
  const root = createTempRoot('qa-boundary-casts-never-');
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/session.ts',
    'export function coerce(value: unknown) { return value as never; }\n'
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-cast-as-never',
        file: 'apps/extension/src/composition/persistence/storage/session.ts',
      }),
    ])
  );
});

it('allows exhaustiveness helpers without as-never casts', async () => {
  const root = createTempRoot('qa-boundary-casts-exhaustive-');
  const file = writeFile(
    root,
    'apps/extension/src/composition/persistence/storage/session.ts',
    [
      'export function assertNever(value: never): never {',
      '  throw new Error(`Unexpected value: ${String(value)}`);',
      '}',
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [file])).resolves.toEqual([]);
});

it('ignores canonical tooling test-support helpers', async () => {
  const root = createTempRoot('qa-boundary-casts-tooling-support-');
  const file = writeFile(
    root,
    'tooling/test/support/runtime/assertions.ts',
    'export function read(text: string) { return JSON.parse(text) as Payload; }\n'
  );

  await expect(collectViolations(root, [file])).resolves.toEqual([]);
});

it('flags typed JSON.parse at import and storage boundaries', async () => {
  const root = createTempRoot('qa-boundary-casts-json-');
  const file = writeFile(
    root,
    'apps/extension/src/editor/document/file-actions/import-session.ts',
    [
      'type EditorDocument = { version: number };',
      'export function parseSession(text: string) {',
      '  return JSON.parse(text) as EditorDocument;',
      '}',
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-json-parse-cast',
        file: 'apps/extension/src/editor/document/file-actions/import-session.ts',
      }),
    ])
  );
});

it('flags nested JSON.parse double-casts at import boundaries', async () => {
  const root = createTempRoot('qa-boundary-casts-json-double-');
  const file = writeFile(
    root,
    'apps/extension/src/editor/document/file-actions/import-session.ts',
    [
      'type EditorDocument = { version: number };',
      'export function parseSession(text: string) {',
      '  return JSON.parse(text) as unknown as EditorDocument;',
      '}',
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-json-parse-cast',
        file: 'apps/extension/src/editor/document/file-actions/import-session.ts',
      }),
    ])
  );
});

it('flags generic typed JSON readers', async () => {
  const root = createTempRoot('qa-boundary-casts-reader-');
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/import/zip/index.ts',
    [
      'declare function readJsonFile<TValue>(name: string): TValue;',
      "export function readManifest() { return readJsonFile<{ id: string }>('manifest.json'); }",
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-cast-typed-json-reader',
        file: 'apps/extension/src/features/video/project/effect-bundle/import/zip/index.ts',
      }),
    ])
  );
});

it('flags boundary String, enum, Record, and Array coercions before parser proof', async () => {
  const root = createTempRoot('qa-boundary-casts-coercions-');
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/json-structure.ts',
    [
      "type Kind = 'template' | 'asset';",
      'export function parse(value: Record<string, unknown>) {',
      "  const kind = value['kind'] as Kind;",
      "  const label = String(value['label']);",
      "  const child = value['child'] as Record<string, unknown>;",
      "  const items = value['items'] as Array<unknown>;",
      '  return { child, items, kind, label };',
      '}',
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: 'boundary-cast-shape-coercion' }),
      expect.objectContaining({ rule: 'boundary-cast-string-coercion' }),
    ])
  );
});

it('flags standalone enum casts in hyphenated parser and importer owners', async () => {
  const root = createTempRoot('qa-boundary-casts-enum-');
  const parserFile = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/manifest.ts',
    [
      "type Kind = 'template' | 'asset';",
      'export function parse(value: Record<string, unknown>) {',
      "  return value['kind'] as Kind;",
      '}',
      '',
    ].join('\n')
  );
  const importerFile = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/import.ts',
    [
      "type PackKind = 'video-template-pack';",
      'export function read(value: Record<string, unknown>) {',
      "  return value['kind'] as PackKind;",
      '}',
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [parserFile, importerFile])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-cast-shape-coercion',
        file: 'apps/extension/src/features/video/project/effect-bundle/manifest.ts',
      }),
      expect.objectContaining({
        rule: 'boundary-cast-shape-coercion',
        file: 'apps/extension/src/features/video/project/effect-bundle/import.ts',
      }),
    ])
  );
});

it('flags nested enum double-casts and direct any casts from boundary fields', async () => {
  const root = createTempRoot('qa-boundary-casts-nested-enum-');
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/json-structure.ts',
    [
      "type Kind = 'template' | 'asset';",
      'export function parse(value: Record<string, unknown>) {',
      "  const directAny = value['label'] as any;",
      "  const kind = value['kind'] as any as Kind;",
      '  return { directAny, kind };',
      '}',
      '',
    ].join('\n')
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-cast-shape-coercion',
        file: 'apps/extension/src/features/video/project/effect-bundle/json-structure.ts',
      }),
      expect.objectContaining({
        rule: 'boundary-cast-shape-coercion',
        file: 'apps/extension/src/features/video/project/effect-bundle/json-structure.ts',
      }),
    ])
  );
});

it('allows private unsafe post-validation normalizers with adjacent boundary tests', async () => {
  const root = createTempRoot('qa-boundary-casts-unsafe-');
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/unsafe-normalize.ts',
    [
      'export function unsafeNormalizeValidatedTemplate(value: unknown) {',
      '  return value as Record<string, unknown>;',
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/unsafe-normalize.test.ts',
    "import { unsafeNormalizeValidatedTemplate } from './unsafe-normalize';\n"
  );

  await expect(collectViolations(root, [file])).resolves.toEqual([]);
});

it('flags unsafe helpers when only unrelated adjacent tests exist', async () => {
  const root = createTempRoot('qa-boundary-casts-unsafe-missing-test-');
  const file = writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/unsafe-normalize.ts',
    [
      'export function unsafeNormalizeValidatedTemplate(value: unknown) {',
      '  return value;',
      '}',
      '',
    ].join('\n')
  );
  writeFile(
    root,
    'apps/extension/src/features/video/project/effect-bundle/labels.test.ts',
    'it.todo("labels");\n'
  );

  await expect(collectViolations(root, [file])).resolves.toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        rule: 'boundary-cast-unsafe-helper-proof',
        file: 'apps/extension/src/features/video/project/effect-bundle/unsafe-normalize.ts',
      }),
    ])
  );
});
