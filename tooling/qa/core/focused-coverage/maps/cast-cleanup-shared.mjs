export const CAST_CLEANUP_SHARED_OWNER_MAPPINGS = [
  {
    owner: 'content-parser-ai-edit-response-boundary',
    productionFile: 'apps/extension/src/content/parser/dom-tree-parser/ai/edit-response.ts',
    reason: 'Content AI edit response parsing is covered by focused response parser tests.',
    testFiles: ['apps/extension/src/content/parser/dom-tree-parser/ai/edit-response.test.ts'],
  },
  {
    owner: 'background-llm-edit-response-boundary',
    productionFile: 'apps/extension/src/background/ai/llm/edit-response.ts',
    reason: 'Background provider AI edit response parsing is covered by owner-local parser tests.',
    testFiles: ['apps/extension/src/background/ai/llm/edit-response.test.ts'],
  },
  {
    owner: 'shared-page-style-assets-boundary',
    productionFile: 'apps/extension/src/composition/persistence/page-style/assets.ts',
    reason: 'Page style asset budget parsing is covered by page style asset tests.',
    testFiles: ['apps/extension/src/composition/persistence/page-style/assets.test.ts'],
  },
  {
    owner: 'shared-web-snapshot-record-guards',
    productionFile: 'apps/extension/src/composition/persistence/web-snapshots/guards.ts',
    reason: 'Web snapshot record guard parsing is covered by web snapshot guard tests.',
    testFiles: ['apps/extension/src/composition/persistence/web-snapshots/guards.test.ts'],
  },
  {
    owner: 'scenario-project-capture-guards',
    productionPrefix:
      'apps/extension/src/composition/persistence/scenario/projects/guards/capture/',
    reason: 'Scenario capture overlay parsing is covered by capture overlay tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/projects/guards/capture/overlays.test.ts',
    ],
  },
  {
    owner: 'scenario-suggested-event-guards',
    productionPrefix:
      'apps/extension/src/composition/persistence/scenario/projects/guards/project/suggested-event/',
    reason: 'Suggested event parsing is covered by suggested event guard tests.',
    testFiles: [
      'apps/extension/src/composition/persistence/scenario/projects/guards/project/suggested-event/parse.test.ts',
    ],
  },
  {
    owner: 'shared-message-tracer-root',
    productionFile: 'packages/platform/src/observability/message-tracer/index.ts',
    reason:
      'Message tracer initialization and repeated-init behavior are covered by root tracer tests.',
    testFiles: ['packages/platform/src/observability/message-tracer/index.test.ts'],
  },
  {
    owner: 'shared-message-tracer-llm-payload',
    productionFile: 'packages/platform/src/observability/message-tracer/llm-payload.ts',
    reason: 'LLM trace payload sanitization is covered by the focused LLM payload suite.',
    testFiles: ['packages/platform/src/observability/message-tracer/llm-payload.test.ts'],
  },
  {
    owner: 'shared-message-tracer-messaging',
    productionFile: 'packages/platform/src/observability/message-tracer/messaging.ts',
    reason: 'Message tracer serialization and send tracking are covered by messaging tests.',
    testFiles: ['packages/platform/src/observability/message-tracer/messaging.test.ts'],
  },
  {
    owner: 'shared-message-tracer-utils',
    productionFile: 'packages/platform/src/observability/message-tracer/utils.ts',
    reason: 'Message tracer recursive sanitization is covered by utility sanitizer tests.',
    testFiles: ['packages/platform/src/observability/message-tracer/utils.test.ts'],
  },
  {
    owner: 'shared-logger-sanitization',
    productionFile: 'packages/platform/src/observability/logger/index.ts',
    reason: 'Logger sink sanitization is covered by logger tests.',
    testFiles: ['packages/platform/src/observability/logger/index.test.ts'],
  },
  {
    owner: 'media-hub-event-boundary',
    productionFile: 'apps/extension/src/features/media-hub/events/index.ts',
    reason: 'Media hub event parsing and publishing are covered by media hub events tests.',
    testFiles: ['apps/extension/src/features/media-hub/events/index.test.ts'],
  },
  {
    owner: 'media-hub-backup-manifest-boundary',
    productionPrefix: 'apps/extension/src/workflows/media-hub-backup/manifest/index',
    reason: 'Backup manifest parsing and privacy options are covered by manifest tests.',
    testFiles: [
      'apps/extension/src/workflows/media-hub-backup/manifest/index.test.ts',
      'apps/extension/src/workflows/media-hub-backup/manifest/privacy-options.test.ts',
    ],
  },
  {
    owner: 'shared-css-sanitizer-boundary',
    productionFile: 'apps/extension/src/features/highlighter/css-sanitizer/css.ts',
    reason: 'CSS sanitizer parsed style assignment is covered by CSS sanitizer tests.',
    testFiles: ['apps/extension/src/features/highlighter/css-sanitizer/css.test.ts'],
  },
  {
    owner: 'scenario-template-validation-boundary',
    productionFile: 'apps/extension/src/features/scenario/project/v3/templates/validation.ts',
    reason: 'Scenario template boundary cast cleanup is covered by import-pack validation tests.',
    testFiles: ['apps/extension/src/features/scenario/project/v3/templates/import-pack.test.ts'],
  },
  {
    owner: 'shared-editor-scene-background-storage',
    productionFile:
      'apps/extension/src/composition/persistence/editor-presets/scene-background-setting-parser.ts',
    reason: 'Scene background storage parsing is covered by editor preset parser tests.',
    testFiles: ['apps/extension/src/composition/persistence/editor-presets/guards.test.ts'],
  },
  {
    owner: 'shared-design-system-preview-copy',
    productionPrefix: 'apps/extension/src/design-system/previews/support/',
    reason: 'Design-system preview copy localization is covered by preview copy tests.',
    testFiles: ['apps/extension/src/design-system/previews/support/common.test.ts'],
  },
  {
    owner: 'shared-design-system-product-preview-copy',
    productionFile: 'apps/extension/src/design-system/previews/support/product.ts',
    reason: 'Product preview copy localization is covered by product preview copy tests.',
    testFiles: ['apps/extension/src/design-system/previews/support/common.test.ts'],
  },
  {
    owner: 'video-annotation-legacy-refs',
    productionPrefix: 'apps/extension/src/features/video/project/annotation-engine/legacy',
    reason: 'Legacy annotation template reference compatibility is covered by registry tests.',
    testFiles: ['apps/extension/src/features/video/project/annotation-engine/registry.test.ts'],
  },
];
