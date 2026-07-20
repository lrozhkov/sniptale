import { CAST_CLEANUP_CONTENT_OWNER_MAPPINGS } from './cast-cleanup-content.mjs';
import { CAST_CLEANUP_RUNTIME_OWNER_MAPPINGS } from './cast-cleanup-runtime.mjs';
import { CAST_CLEANUP_SHARED_OWNER_MAPPINGS } from './cast-cleanup-shared.mjs';

const CAST_CLEANUP_LOCAL_OWNER_MAPPING_ENTRIES = [
  {
    owner: 'editor-freehand-committed-brush-boundary',
    productionFile: 'apps/extension/src/editor/controller/freehand/brush-committed.ts',
    reason: 'Committed brush prototype method detection is covered by focused brush suites.',
    testFiles: ['apps/extension/src/editor/controller/freehand/brush-committed.test.ts'],
  },
  {
    owner: 'editor-freehand-points-boundary',
    productionFile: 'apps/extension/src/editor/controller/freehand/points.ts',
    reason: 'Freehand point parsing is covered by the focused points suite.',
    testFiles: ['apps/extension/src/editor/controller/freehand/points.test.ts'],
  },
  {
    owner: 'editor-magnet-vendor-adapter',
    productionFile: 'apps/extension/src/editor/controller/magnet/aligning-guidelines.ts',
    reason: 'Fabric aligning guideline adapter behavior is covered by magnet manager tests.',
    testFiles: ['apps/extension/src/editor/controller/magnet/manager.test.ts'],
  },
  {
    owner: 'editor-tool-icons-static-map',
    productionFile: 'apps/extension/src/editor/chrome/tool-icons.tsx',
    reason: 'Editor tool icon map completeness is covered by tool icon tests.',
    testFiles: ['apps/extension/src/editor/chrome/tool-icons.test.tsx'],
  },
  {
    owner: 'scenario-editor-template-picker-static-copy',
    productionFile: 'apps/extension/src/scenario-editor/project/templates/picker.tsx',
    reason: 'Scenario template picker copy is covered by picker rendering tests.',
    testFiles: ['apps/extension/src/scenario-editor/project/templates/picker.test.tsx'],
  },
  {
    owner: 'video-editor-diagnostics-panel-action-text',
    productionFile: 'apps/extension/src/video-editor/diagnostics/panel/action-text.ts',
    reason: 'Diagnostics action text parsing is covered by action text tests.',
    testFiles: ['apps/extension/src/video-editor/diagnostics/panel/action-text.test.ts'],
  },
  {
    owner: 'video-editor-effects-library-state',
    productionFile: 'apps/extension/src/video-editor/library/effects-dock/index.tsx',
    reason: 'Effects library state and counts are covered by dock tests.',
    testFiles: ['apps/extension/src/video-editor/library/effects-dock/index.test.tsx'],
  },
];

export const CAST_CLEANUP_OWNER_MAPPINGS = [
  ...CAST_CLEANUP_RUNTIME_OWNER_MAPPINGS,
  ...CAST_CLEANUP_CONTENT_OWNER_MAPPINGS,
  ...CAST_CLEANUP_SHARED_OWNER_MAPPINGS,
  ...CAST_CLEANUP_LOCAL_OWNER_MAPPING_ENTRIES,
].map((entry) => ({
  ...entry,
  exclusive: true,
}));
