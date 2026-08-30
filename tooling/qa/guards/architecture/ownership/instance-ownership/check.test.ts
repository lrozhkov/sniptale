import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectCodeFiles } from '../../../../analysis/repository/shared-files.mjs';
import {
  OWNERSHIP_FACADE_FILES,
  OWNERSHIP_STATE_FILES,
  collectDefaultFactoryOwnerFiles,
  collectOwnershipViolationsFromSources,
} from './check.mjs';

function createEntry(relativePath: string, source: string) {
  return {
    filePath: path.join('/tmp', relativePath),
    relativePath,
    source,
  };
}

const topLevelMutableStateSource = [
  'let active = false;',
  'export function demo() {',
  '  let local = 1;',
  '  return local;',
  '}',
  '',
].join('\n');

const allowedDefaultOwnerSource = [
  "import { createHighlighterController } from './highlighter.controller';",
  'const defaultHighlighterController = createHighlighterController();',
  'export function enableHighlighterMode() {}',
  '',
].join('\n');

const disallowedFacadeOwnerSource = [
  "import { createHighlighterController } from './highlighter.controller';",
  'const highlighterController = createHighlighterController();',
  '',
].join('\n');

const allowedNonOwnerCreateSource = [
  "import { createLogger } from '../../shared/logger';",
  'const logger = createLogger({ namespace: "ContentHighlighter:Runtime" });',
  '',
].join('\n');

const editorSingletonImportSource =
  "import { imageEditorController } from '../lib/editor-controller';\n";
const aliasedCombinedEditorSingletonImportSource =
  "import { editorHelpers, imageEditorController as controller } from '../lib/editor-controller';\n";
const mutableConstObjectSource = [
  'const recordingContext = { active: false, currentId: null as string | null };',
  '',
].join('\n');
const mutableConstMapSource = ['const attachedTabs = new Map<number, string>();', ''].join('\n');
const allowedConstConfigSource = [
  'const OVERLAY_RESTORE_RETRY_DELAYS_MS = [0, 250, 1000];',
  '',
].join('\n');

function collectRepositoryEntries() {
  return collectCodeFiles()
    .filter((relativePath) => /\.(?:ts|tsx)$/u.test(relativePath))
    .map((relativePath) => ({
      filePath: path.resolve(relativePath),
      relativePath,
      source: fs.readFileSync(relativePath, 'utf8'),
    }));
}

describe('collectOwnershipViolationsFromSources runtime state', () => {
  it('flags top-level mutable runtime state but ignores function-local lets', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/content/selection/selection-mode/controller/index.ts',
          topLevelMutableStateSource
        ),
      ])
    ).toEqual([
      expect.objectContaining({
        rule: 'module-global-runtime-state',
        file: 'apps/extension/src/content/selection/selection-mode/controller/index.ts',
      }),
    ]);
  });

  it('flags top-level const runtime containers in registered ownership seams', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/offscreen/recording/context/index.ts',
          mutableConstObjectSource
        ),
        createEntry(
          'apps/extension/src/offscreen/recording/start/session.ts',
          mutableConstMapSource
        ),
      ])
    ).toEqual([
      expect.objectContaining({
        rule: 'module-global-runtime-state',
        file: 'apps/extension/src/offscreen/recording/context/index.ts',
      }),
      expect.objectContaining({
        rule: 'module-global-runtime-state',
        file: 'apps/extension/src/offscreen/recording/start/session.ts',
      }),
    ]);
  });
});

it('ignores top-level const config literals that are not runtime state holders', () => {
  expect(
    collectOwnershipViolationsFromSources([
      createEntry(
        'apps/extension/src/background/media/video/session-state/index.ts',
        allowedConstConfigSource
      ),
    ])
  ).toEqual([]);
});

describe('collectOwnershipViolationsFromSources facade ownership', () => {
  it('allows default-wrapper create owners in facade files', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/content/selection/highlighter/index.ts',
          allowedDefaultOwnerSource
        ),
      ])
    ).toEqual([]);
  });

  it('flags non-default top-level create owners in facade files', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/content/selection/highlighter/index.ts',
          disallowedFacadeOwnerSource
        ),
      ])
    ).toEqual([
      expect.objectContaining({
        rule: 'facade-default-owner',
        file: 'apps/extension/src/content/selection/highlighter/index.ts',
      }),
    ]);
  });

  it('ignores top-level create helpers that are not ownership factories', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/content/selection/highlighter/index.ts',
          allowedNonOwnerCreateSource
        ),
      ])
    ).toEqual([]);
  });

  it('rejects an unregistered default singleton factory under any live source filename', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/content/arbitrary/runtime-owner.ts',
          'const defaultArbitraryService = createArbitraryService();\n'
        ),
      ])
    ).toEqual([
      expect.objectContaining({
        rule: 'default-factory-owner-unregistered',
        file: 'apps/extension/src/content/arbitrary/runtime-owner.ts',
      }),
    ]);
  });
});

describe('collectOwnershipViolationsFromSources editor ownership', () => {
  it('flags editor ui singleton imports outside the controller seam', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
          editorSingletonImportSource
        ),
      ])
    ).toEqual([
      expect.objectContaining({
        rule: 'editor-controller-singleton-import',
        file: 'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
      }),
    ]);
  });

  it('flags aliased singleton specifiers inside combined named imports', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
          aliasedCombinedEditorSingletonImportSource
        ),
      ])
    ).toEqual([expect.objectContaining({ rule: 'editor-controller-singleton-import' })]);
  });

  it('ignores comments and unrelated specifiers from the same module', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/editor/workspace/toolbar/EditorToolbar.tsx',
          "// import { imageEditorController } from '../lib/editor-controller';\nimport { editorHelpers } from '../lib/editor-controller';\n"
        ),
      ])
    ).toEqual([]);
  });
});

describe('ownership registry coverage', () => {
  it('automatically covers every current default or lazy singleton factory', () => {
    const factoryFiles = collectDefaultFactoryOwnerFiles(collectRepositoryEntries());
    expect(factoryFiles.length).toBeGreaterThan(0);
    expect(factoryFiles.filter((file) => !OWNERSHIP_FACADE_FILES.has(file))).toEqual([]);
    expect(factoryFiles).toContain('packages/ui/src/product-feedback/toast-service/index.ts');
  }, 60_000);

  it('tracks newly registered shared, background, and scenario owner seams', () => {
    expect(OWNERSHIP_FACADE_FILES.has('apps/extension/src/ui/theme/index.ts')).toBe(true);
    expect(OWNERSHIP_FACADE_FILES.has('apps/extension/src/platform/i18n/locale/state.ts')).toBe(
      true
    );
    expect(
      OWNERSHIP_FACADE_FILES.has('apps/extension/src/background/media/video/session-state/index.ts')
    ).toBe(true);
    expect(
      OWNERSHIP_FACADE_FILES.has(
        'apps/extension/src/background/media/video/runtime/session-state/service/index.ts'
      )
    ).toBe(true);
    expect(
      OWNERSHIP_FACADE_FILES.has(
        'apps/extension/src/background/media/video/runtime/session-state/service/runtime-state-service.ts'
      )
    ).toBe(true);
    expect(
      OWNERSHIP_STATE_FILES.has('apps/extension/src/offscreen/recording/start/session.ts')
    ).toBe(true);
    expect(
      OWNERSHIP_STATE_FILES.has('apps/extension/src/scenario-editor/project/state/index.ts')
    ).toBe(true);
  });
});
