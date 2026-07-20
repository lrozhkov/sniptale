import {
  LAYER_LEAKAGE_BASELINE,
  PRODUCT_TO_PRODUCT_IMPORT_BASELINE,
} from './architecture-guardrails.data.mjs';
import { getRuntimeTopology } from './runtime-topology.mjs';
import { repoRoot } from './shared.mjs';
import {
  collectExactBaselineViolations,
  collectProductionImportEdges,
  createViolation,
  isProductionSourceFile,
} from './architecture-guardrails.helpers.mjs';

function getRuntimeRootForFile(relativePath, root) {
  return getRuntimeTopology(root)
    .map((runtime) => runtime.root)
    .sort((left, right) => right.length - left.length)
    .find(
      (runtimeRoot) => relativePath === runtimeRoot || relativePath.startsWith(`${runtimeRoot}/`)
    );
}

function edgeKey(edge) {
  return `${edge.from}\0${edge.to}`;
}

function baselineKey([from, to]) {
  return `${from}\0${to}`;
}

function isBaselineEdge(edge, baseline) {
  const allowed = new Set(baseline.map(baselineKey));
  return allowed.has(edgeKey(edge));
}

function isAllowedViewerPreparationSurfaceImport(edge) {
  const publicSurfaceRoot = 'apps/extension/src/content/public/preparation-surface';
  return (
    edge.from.startsWith('apps/extension/src/web-snapshot-viewer/preparation') &&
    (edge.to === publicSurfaceRoot || edge.to.startsWith(`${publicSurfaceRoot}/`))
  );
}

export function collectBroadFacadeImportBaselineViolations() {
  return [];
}

export function collectRuntimeCrossImportViolations(files, { root = repoRoot } = {}) {
  return collectProductionImportEdges(files, { root }).flatMap((edge) => {
    const fromRoot = getRuntimeRootForFile(edge.from, root);
    const toRoot = getRuntimeRootForFile(edge.to, root);
    if (
      !fromRoot ||
      !toRoot ||
      fromRoot === toRoot ||
      isBaselineEdge(edge, PRODUCT_TO_PRODUCT_IMPORT_BASELINE) ||
      isAllowedViewerPreparationSurfaceImport(edge)
    ) {
      return [];
    }
    return [
      createViolation(
        'runtime-cross-import',
        edge.from,
        [
          `Runtime "${fromRoot}" imports runtime "${toRoot}" via "${edge.specifier}".`,
          'Use shared contracts/adapters instead.',
        ].join(' '),
        edge.line
      ),
    ];
  });
}

export function collectLayerLeakageViolations(
  files,
  { baseline = LAYER_LEAKAGE_BASELINE, root = repoRoot } = {}
) {
  const rawViolations = collectProductionImportEdges(files, { root })
    .map(createLayerLeakageViolation)
    .filter(Boolean);
  return collectExactBaselineViolations(rawViolations, baseline, formatExactScopeDrift);
}

function createLayerLeakageViolation(edge) {
  if (
    edge.from.startsWith('apps/extension/src/content/parser/') &&
    edge.to.startsWith('apps/extension/src/content/overlay/')
  ) {
    return createViolation(
      'content-parser-imports-content-overlay',
      edge.from,
      'content/parser must not import content/overlay; move shared behavior to parser contracts or a stable adapter.',
      edge.line
    );
  }
  if (
    edge.from.startsWith('apps/extension/src/video-editor/runtime/') &&
    isVideoEditorProductSurfaceTarget(edge.to)
  ) {
    return createViolation(
      'video-editor-runtime-imports-product-surface',
      edge.from,
      'video-editor/runtime must not import product surfaces; keep runtime below view composition.',
      edge.line
    );
  }
  return createVideoEditorStoreAuthorityViolation(edge);
}

function isVideoEditorProductSurfaceTarget(target) {
  const prefix = 'apps/extension/src/video-editor/';
  if (!target.startsWith(prefix)) return false;
  return /^(?:chrome|diagnostics|export|library|preview|recording|shell|timeline|workspace)\//u.test(
    target.slice(prefix.length)
  );
}

function isVideoEditorStateAuthorityTarget(target) {
  return (
    target === 'apps/extension/src/video-editor/state/store' ||
    target === 'apps/extension/src/video-editor/state/store.ts' ||
    target === 'apps/extension/src/video-editor/state/types' ||
    target === 'apps/extension/src/video-editor/state/types.ts'
  );
}

function createVideoEditorStoreAuthorityViolation(edge) {
  if (
    !edge.from.startsWith('apps/extension/src/video-editor/runtime/') ||
    edge.from === 'apps/extension/src/video-editor/runtime/controller/store.ts' ||
    !isVideoEditorStateAuthorityTarget(edge.to)
  ) {
    return createVideoEditorLayerBackedgeViolation(edge);
  }
  return createViolation(
    'video-editor-runtime-imports-store-authority',
    edge.from,
    [
      'video-editor/runtime must consume explicit contracts;',
      'only runtime/controller/store.ts may adapt the full Zustand state.',
    ].join(' '),
    edge.line
  );
}

const VIDEO_EDITOR_OWNER_LAYER = new Map([
  ['contracts', 0],
  ['project', 0],
  ['interaction', 1],
  ['runtime', 1],
  ['state', 1],
  ['chrome', 2],
  ['export', 2],
  ['library', 2],
  ['preview', 2],
  ['timeline', 2],
  ['workspace', 3],
  ['shell', 4],
]);

function getVideoEditorOwner(relativePath) {
  const segments = relativePath.split('/');
  if (segments.slice(0, 4).join('/') !== 'apps/extension/src/video-editor') {
    return null;
  }

  return segments[4] ?? null;
}

function createVideoEditorLayerBackedgeViolation(edge) {
  const fromOwner = getVideoEditorOwner(edge.from);
  const toOwner = getVideoEditorOwner(edge.to);
  const fromLayer = VIDEO_EDITOR_OWNER_LAYER.get(fromOwner);
  const toLayer = VIDEO_EDITOR_OWNER_LAYER.get(toOwner);
  if (fromLayer === undefined || toLayer === undefined || fromLayer >= toLayer) {
    return null;
  }

  return createViolation(
    'video-editor-layer-backedge',
    edge.from,
    [
      `video-editor/${fromOwner} must not import higher layer video-editor/${toOwner}.`,
      'Move shared policy or presentation primitives to the lower canonical owner.',
    ].join(' '),
    edge.line
  );
}

function formatExactScopeDrift(rule, { added, removed }) {
  return [
    `${rule} exact occurrence scope changed;`,
    `added=[${added.join(', ')}]; removed=[${removed.join(', ')}].`,
    'Update the baseline only after owner review.',
  ].join(' ');
}

export function filterProductionSourceFiles(files) {
  return files.filter(isProductionSourceFile);
}
