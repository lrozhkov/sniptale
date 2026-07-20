import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';

const repoRoot = process.cwd();
const inventoryRoots = [
  'apps/extension/src/background/capture/native-app/persistence',
  'apps/extension/src/composition/persistence',
  'apps/extension/src/editor/objects/custom-shapes',
  'apps/extension/src/workflows/media-hub-backup/restore',
] as const;
const delegatedMutationHelpers = new Set([
  'apps/extension/src/composition/persistence/editor-bootstrap/retention-cleanup.ts',
  'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/provenance.ts',
  'apps/extension/src/composition/persistence/infrastructure/indexed-db/maintenance/web-snapshot-lease.ts',
  'apps/extension/src/composition/persistence/projects/asset-references.ts',
  'apps/extension/src/composition/persistence/projects/mutation-stores.ts',
  'apps/extension/src/composition/persistence/video-preview-cache/database.ts',
]);
const indexedDbMutationPattern =
  /(?:\b(?:db|tx|store|cursor)|\b\w+Store)\.(?:put|delete|clear)\s*\(|\.transaction\([\s\S]{0,180}?["']readwrite["']/m;
const pageLocalStorageErasureFile =
  'apps/extension/src/composition/persistence/privacy-erasure/page-local-storage.ts';

function listProductionTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return listProductionTypeScriptFiles(path);
    }
    return entry.name.endsWith('.ts') &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test-support.ts')
      ? [path]
      : [];
  });
}

it('keeps every IndexedDB mutation leaf behind the persistent mutation barrier', () => {
  const mutationFiles = inventoryRoots
    .flatMap((root) => listProductionTypeScriptFiles(join(repoRoot, root)))
    .filter((path) => indexedDbMutationPattern.test(readFileSync(path, 'utf8')));
  const unguardedMutationFiles = mutationFiles
    .filter((path) => {
      const source = readFileSync(path, 'utf8');
      return (
        !source.includes('runWithIndexedDbMutation') &&
        !source.includes('runWithPersistenceMutationPermit')
      );
    })
    .map((path) => relative(repoRoot, path))
    .sort();

  expect(unguardedMutationFiles).toEqual([...delegatedMutationHelpers].sort());
});

it('commits project assets and their media rows inside one admitted transaction', () => {
  const source = readFileSync(
    join(repoRoot, 'apps/extension/src/composition/persistence/projects/index.ts'),
    'utf8'
  );

  expect(source).not.toContain('upsertMediaEntry');
  expect(source).toContain('[PROJECT_ASSETS_STORE, MEDIA_LIBRARY_STORE]');
});

it('keeps the complete extension-page localStorage writer inventory behind the same barrier', () => {
  const files = listProductionTypeScriptFiles(join(repoRoot, 'apps/extension/src'));
  const localStorageMutationFiles = files
    .filter((path) =>
      /(?:localStorage|storage)\.(?:removeItem|setItem)\s*\(/.test(readFileSync(path, 'utf8'))
    )
    .map((path) => relative(repoRoot, path))
    .sort();

  expect(localStorageMutationFiles).toEqual([
    pageLocalStorageErasureFile,
    'apps/extension/src/editor/inspector/presets/view-mode.ts',
    'apps/extension/src/platform/i18n/locale/state.ts',
    'apps/extension/src/ui/theme/preference-service.ts',
  ]);
  for (const path of localStorageMutationFiles.filter(
    (path) => path !== pageLocalStorageErasureFile
  )) {
    expect(readFileSync(join(repoRoot, path), 'utf8')).toMatch(
      /runWithPersist(?:enceMutationPermit|entDataErasureBarrier)/
    );
  }

  const cleanupSource = readFileSync(
    join(repoRoot, 'apps/extension/src/composition/persistence/privacy-erasure/cleanup.ts'),
    'utf8'
  );
  const offscreenHandlerSource = readFileSync(
    join(repoRoot, 'apps/extension/src/offscreen/runtime/privacy-erasure.ts'),
    'utf8'
  );
  expect(cleanupSource).toContain('runWithPersistentDataErasureBarrier');
  expect(cleanupSource).toContain('extensionPageLocalStorage');
  expect(offscreenHandlerSource).toContain('eraseExtensionPageLocalStorage');
});
