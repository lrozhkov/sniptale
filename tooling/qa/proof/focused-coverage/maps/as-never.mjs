export const AS_NEVER_REMOVAL_OWNER_MAPPINGS = [
  {
    owner: 'shared-string-literal-boundaries',
    productionFile: 'packages/runtime-contracts/src/validation/string-literals.ts',
    reason:
      'Shared literal narrowing is exercised through scenario, storage, runtime, and EffectV1 boundary suites.',
    testFiles: [
      'apps/extension/src/background/runtime/routing/runtime-wiring/parsers.test.ts',
      'apps/extension/src/composition/persistence/highlighter/guards.test.ts',
      'apps/extension/src/features/video/project/effect-bundle/boundary.test.ts',
    ],
  },
  {
    owner: 'runtime-wiring-parser-boundaries',
    productionFile: 'apps/extension/src/background/runtime/routing/runtime-wiring/parsers.ts',
    reason: 'Runtime wiring parser narrowing is covered by the focused parser suite.',
    testFiles: ['apps/extension/src/background/runtime/routing/runtime-wiring/parsers.test.ts'],
  },
  {
    owner: 'background-offscreen-document-boundary',
    productionFile: 'apps/extension/src/background/offscreen-document/service.ts',
    reason:
      'Offscreen context lookup and document creation are covered by shared lifecycle owner suites.',
    testFiles: [
      'apps/extension/src/background/offscreen-document/service.creation.test.ts',
      'apps/extension/src/background/offscreen-document/service.test.ts',
    ],
  },
  {
    owner: 'background-offscreen-document-boundary',
    productionFile: 'apps/extension/src/background/offscreen-document/create-options.ts',
    reason:
      'Offscreen Chrome enum-compatible DTO construction is covered by shared lifecycle creation tests.',
    testFiles: ['apps/extension/src/background/offscreen-document/service.creation.test.ts'],
  },
  {
    owner: 'project-export-renderer-clip-compatibility',
    productionFile: 'apps/extension/src/offscreen/project-export/renderer/clip.ts',
    reason: 'Project export clip compatibility layers are covered by renderer clip tests.',
    testFiles: ['apps/extension/src/offscreen/project-export/renderer/clip.test.ts'],
  },
  {
    owner: 'popup-capture-mode-selector',
    productionFile:
      'apps/extension/src/popup/recording/video/setup/options/capture-mode-selector.tsx',
    reason: 'Capture mode selector labels and disabled states are covered by its component suite.',
    testFiles: [
      'apps/extension/src/popup/recording/video/setup/options/capture-mode-selector.test.tsx',
    ],
  },
  {
    owner: 'shared-highlighter-blur-guards',
    productionPrefix: 'apps/extension/src/composition/persistence/highlighter/blur-',
    reason: 'Highlighter blur settings and stroke-style parsing are covered by storage guards.',
    testFiles: ['apps/extension/src/composition/persistence/highlighter/guards.test.ts'],
  },
  {
    owner: 'video-annotation-style-floors',
    productionFile: 'apps/extension/src/features/video/project/annotation/style-presets.ts',
    reason: 'Annotation template style floor behavior is covered by focused style floor tests.',
    testFiles: ['apps/extension/src/features/video/project/annotation/style-floors.test.ts'],
  },
];
