import fs from 'node:fs';

const architectureDebt = JSON.parse(
  fs.readFileSync(new URL('../../configs/qa/architecture-debt.data.json', import.meta.url), 'utf8')
);

function architectureBaseline(...rules) {
  const selected = new Set(rules);
  return Object.fromEntries(
    architectureDebt.baselines
      .filter((entry) => selected.has(entry.rule))
      .map((entry) => [entry.rule, entry.occurrences])
  );
}

export const FROZEN_BROAD_FACADE_IMPORT_BASELINE = {};

export const PRODUCT_TO_PRODUCT_IMPORT_BASELINE = [];

export const LAYER_LEAKAGE_BASELINE = {
  'content-logic-imports-content-hooks': [],
  'video-editor-layer-backedge': [],
  'video-editor-runtime-imports-store-authority': [],
  ...architectureBaseline('video-editor-runtime-imports-product-surface'),
};

export const LEGACY_PARSER_CALLER_BASELINE = architectureBaseline(
  'legacy-parser-caller',
  'output-specific-parser-heuristic'
);

export const RAW_STORAGE_MUTATION_BASELINE = {
  'raw-browser-storage-write': [],
};

export const RAW_STORAGE_MUTATION_OWNER_PATHS = [
  { path: 'apps/extension/src/background/capture/download/save-directory/' },
  { path: 'apps/extension/src/content/overlay/ai/persistence/' },
  { path: 'apps/extension/src/content/overlay/auto-blur/persistence/' },
  { path: 'apps/extension/src/editor/persistence/' },
  { path: 'apps/extension/src/popup/persistence/' },
  { path: 'apps/extension/src/scenario-editor/persistence/' },
  { path: 'apps/extension/src/scenario-editor/page-shell/presentation/session/storage/' },
  { path: 'apps/extension/src/video-editor/persistence/' },
];

export { SECOND_LEVEL_SCC_REGISTRY } from './architecture-guardrails.scc-registry.data.mjs';
