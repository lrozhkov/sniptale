import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectCodeFiles } from './shared.mjs';
import {
  OWNERSHIP_FACADE_FILES,
  OWNERSHIP_STATE_FILES,
} from './verify-instance-ownership.data.mjs';
import { collectOwnershipViolationsFromSources } from './verify-instance-ownership.mjs';

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
const mutableConstObjectSource = [
  'const recordingContext = { active: false, currentId: null as string | null };',
  '',
].join('\n');
const mutableConstMapSource = ['const attachedTabs = new Map<number, string>();', ''].join('\n');
const allowedConstConfigSource = [
  'const OVERLAY_RESTORE_RETRY_DELAYS_MS = [0, 250, 1000];',
  '',
].join('\n');

const DEFAULT_OWNER_FACTORY_PATTERN =
  /^const default[A-Z][A-Za-z0-9]*(?:Controller|Service|Session|Runtime|Facade|Locker)\s*=\s*create[A-Z]/mu;

function collectUncoveredFacadeOwnerFiles() {
  return collectCodeFiles()
    .filter((file) => file.startsWith('src/'))
    .filter((file) => !file.includes('.test.') && !file.includes('.spec.'))
    .filter((file) => !file.startsWith('tooling/test/harness/'))
    .filter((file) => DEFAULT_OWNER_FACTORY_PATTERN.test(fs.readFileSync(file, 'utf8')))
    .filter((file) => !OWNERSHIP_FACADE_FILES.has(file))
    .sort();
}

function collectSelfFacadeImportDrift() {
  return collectCodeFiles()
    .filter((file) => /^src\/(?:shared|content\/logic)\/[^/]+\.(?:ts|tsx)$/u.test(file))
    .filter((file) => !file.includes('.test.') && !file.includes('.spec.'))
    .filter((file) => {
      const extension = path.extname(file);
      const baseName = path.basename(file, extension);
      const ownerIndexCandidates = [
        path.join(path.dirname(file), baseName, 'index.ts'),
        path.join(path.dirname(file), baseName, 'index.tsx'),
      ];

      return ownerIndexCandidates.some((candidate) => fs.existsSync(candidate));
    })
    .filter((file) => {
      const extension = path.extname(file);
      const baseName = path.basename(file, extension);
      const source = fs.readFileSync(file, 'utf8');

      return source.includes(`'./${baseName}'`) || source.includes(`"./${baseName}"`);
    })
    .sort();
}

describe('collectOwnershipViolationsFromSources runtime state', () => {
  it('flags top-level mutable runtime state but ignores function-local lets', () => {
    expect(
      collectOwnershipViolationsFromSources([
        createEntry(
          'apps/extension/src/content/selection/selection-mode.controller.ts',
          topLevelMutableStateSource
        ),
      ])
    ).toEqual([
      expect.objectContaining({
        rule: 'module-global-runtime-state',
        file: 'apps/extension/src/content/selection/selection-mode.controller.ts',
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
          'apps/extension/src/background/debugger/session/store.ts',
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
        file: 'apps/extension/src/background/debugger/session/store.ts',
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
});

describe('ownership registry coverage', () => {
  it('covers all top-level default create owner facades in src', () => {
    expect(collectUncoveredFacadeOwnerFiles()).toEqual([]);
  });

  it('prevents root facades from importing a same-name owner folder without an explicit index path', () => {
    expect(collectSelfFacadeImportDrift()).toEqual([]);
  });

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
      OWNERSHIP_STATE_FILES.has('apps/extension/src/background/debugger/session/state-core.ts')
    ).toBe(true);
    expect(
      OWNERSHIP_STATE_FILES.has('apps/extension/src/background/debugger/session/store.ts')
    ).toBe(true);
    expect(
      OWNERSHIP_STATE_FILES.has('apps/extension/src/scenario-editor/useScenarioEditorController.ts')
    ).toBe(true);
  });
});
