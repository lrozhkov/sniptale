import { createHash } from 'node:crypto';
import JSZip from 'jszip';

const REQUIRED_PATHS = Object.freeze({
  assetLedger: 'diagnostics/extended/assets.json',
  computedStyles: 'diagnostics/export/logs/css/computed-styles.json',
  diagnosticIndex: 'diagnostics/index.json',
  fonts: 'diagnostics/export/logs/css/fonts.json',
  frames: 'diagnostics/extended/frames.json',
  liveDom: 'diagnostics/extended/page/live-dom.html.txt',
  issues: 'diagnostics/export/logs/issues.json',
  manifest: 'manifest.json',
  preparedDom: 'diagnostics/extended/page/prepared-dom.html.txt',
  publishedDom: 'diagnostics/extended/page/published-dom.html.txt',
  snapshotHtml: 'snapshot/index.html',
  timeline: 'diagnostics/export/logs/capture-timeline.json',
  applicationMap: 'diagnostics/runtime/application-map.json',
  pageState: 'diagnostics/runtime/page-state.json',
  resourceTiming: 'diagnostics/runtime/resource-timing.json',
});
const SENSITIVE_QUERY_PATTERN =
  /[?&](?:access[_-]?token|api[_-]?key|auth|key|password|secret|signature|token)=([^&#"'\s]+)/giu;
const URL_CREDENTIAL_PATTERN = /:\/\/[^/\s:@]+:[^/\s@]+@/iu;
const EXECUTABLE_DIAGNOSTIC_PATTERN = /(?:\.html?|\.xhtml|\.m?js)$/iu;

function addCheck(checks, id, passed, detail) {
  checks.push({ id, status: passed ? 'passed' : 'failed', ...(detail ? { detail } : {}) });
}

function parseJson(bytesByPath, path) {
  const bytes = bytesByPath.get(path);
  if (!bytes) throw new Error(`Missing ${path}`);
  return JSON.parse(bytes.toString('utf8'));
}

function isManifestEntry(value) {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.mimeType === 'string' &&
    typeof value.path === 'string' &&
    typeof value.sha256 === 'string' &&
    Number.isSafeInteger(value.size) &&
    value.size >= 0
  );
}

async function readArchive(archiveBytes) {
  const zip = await JSZip.loadAsync(archiveBytes);
  const files = Object.values(zip.files).filter((entry) => !entry.dir);
  const bytesByPath = new Map();
  for (const entry of files) bytesByPath.set(entry.name, await entry.async('nodebuffer'));
  return bytesByPath;
}

function verifyIndex(checks, bytesByPath) {
  const index = parseJson(bytesByPath, REQUIRED_PATHS.diagnosticIndex);
  const representations = new Map(
    Array.isArray(index.representations)
      ? index.representations.map((item) => [item?.stage, item])
      : []
  );
  const expected = new Map([
    ['live', REQUIRED_PATHS.liveDom],
    ['prepared', REQUIRED_PATHS.preparedDom],
    ['published', REQUIRED_PATHS.publishedDom],
  ]);
  const validRepresentations = [...expected].every(([stage, path]) => {
    const item = representations.get(stage);
    return item?.available === true && item.path === path && bytesByPath.has(path);
  });
  const indexedEntries = Array.isArray(index.sections)
    ? index.sections.flatMap((section) => (Array.isArray(section?.entries) ? section.entries : []))
    : [];
  const conditions = {
    archiveAuthority: index.authority?.archiveInventory === REQUIRED_PATHS.manifest,
    indexedEntries: indexedEntries.every((path) => bytesByPath.has(path)),
    inert: index.safety?.diagnosticsAreInert === true,
    representations: validRepresentations,
    schemaVersion: index.schemaVersion === 1,
  };
  const failedConditions = Object.entries(conditions)
    .filter(([, passed]) => !passed)
    .map(([id]) => id);
  const representationDetail = JSON.stringify(index.representations ?? null);
  addCheck(
    checks,
    'diagnostics-index',
    failedConditions.length === 0,
    failedConditions.length > 0
      ? `Invalid index fields: ${failedConditions.join(', ')}; representations=${representationDetail}`
      : ''
  );
}

function verifyTimeline(checks, bytesByPath) {
  const timeline = parseJson(bytesByPath, REQUIRED_PATHS.timeline);
  const events = Array.isArray(timeline.events) ? timeline.events : [];
  const sequential = events.every(
    (event, index) =>
      Number.isFinite(event?.elapsedMs) &&
      event.elapsedMs >= 0 &&
      (index === 0 || event.elapsedMs >= events[index - 1].elapsedMs) &&
      typeof event.phase === 'string' &&
      (typeof event.step === 'string' || event.step === null)
  );
  addCheck(checks, 'capture-timeline', events.length > 0 && sequential);
}

function verifyDomStates(checks, bytesByPath) {
  const stagesPresent = [
    REQUIRED_PATHS.liveDom,
    REQUIRED_PATHS.preparedDom,
    REQUIRED_PATHS.publishedDom,
  ].every((path) => (bytesByPath.get(path)?.byteLength ?? 0) > 0);
  addCheck(checks, 'dom-states', stagesPresent);
  addCheck(
    checks,
    'published-dom-parity',
    bytesByPath
      .get(REQUIRED_PATHS.publishedDom)
      ?.equals(bytesByPath.get(REQUIRED_PATHS.snapshotHtml)) === true
  );
}

function verifyAssetLedger(checks, bytesByPath, manifestEntries) {
  const ledger = parseJson(bytesByPath, REQUIRED_PATHS.assetLedger);
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const byPath = new Map(manifestEntries.map((entry) => [entry.path, entry]));
  const valid = entries.every((entry) => {
    if (!entry || !['captured', 'skipped'].includes(entry.status)) return false;
    if (entry.status === 'skipped') {
      return (
        entry.localPath === null && typeof entry.reason === 'string' && entry.reason.length > 0
      );
    }
    const manifestEntry = byPath.get(entry.localPath);
    return (
      manifestEntry?.mimeType === entry.mimeType &&
      manifestEntry?.size === entry.size &&
      manifestEntry?.sha256 === entry.sha256 &&
      entry.reason === null
    );
  });
  addCheck(
    checks,
    'asset-ledger',
    Number.isSafeInteger(ledger.total) &&
      Number.isSafeInteger(ledger.omitted) &&
      ledger.total === entries.length + ledger.omitted &&
      valid
  );
}

function verifyStyleDiagnostics(checks, bytesByPath) {
  const styles = parseJson(bytesByPath, REQUIRED_PATHS.computedStyles);
  const fonts = parseJson(bytesByPath, REQUIRED_PATHS.fonts);
  const fontEvidence = ['declaredFaces', 'loadedFonts', 'usage'].some(
    (key) => Array.isArray(fonts[key]) && fonts[key].length > 0
  );
  const styleDetail = [
    `totalTargets=${String(styles.totalTargets)}`,
    `retainedTargets=${String(styles.targets?.length ?? 'invalid')}`,
    `source=${JSON.stringify(styles.source ?? null)}`,
  ].join('; ');
  const fontDetail = [
    `declared=${String(fonts.declaredFaces?.length ?? 'invalid')}`,
    `loaded=${String(fonts.loadedFonts?.length ?? 'invalid')}`,
    `usage=${String(fonts.usage?.length ?? 'invalid')}`,
    `source=${JSON.stringify(fonts.source ?? null)}`,
  ].join('; ');
  addCheck(
    checks,
    'css-probes',
    Number.isSafeInteger(styles.totalTargets) &&
      styles.totalTargets > 0 &&
      Array.isArray(styles.targets) &&
      styles.targets.length > 0,
    styleDetail
  );
  addCheck(checks, 'font-probes', fontEvidence, fontDetail);
}

function verifyFrameDiagnostics(checks, bytesByPath) {
  const frames = parseJson(bytesByPath, REQUIRED_PATHS.frames);
  addCheck(
    checks,
    'frame-shadow-metadata',
    Array.isArray(frames.frames) && Array.isArray(frames.openShadowRoots)
  );
}

function verifyRuntimeDiagnostics(checks, bytesByPath) {
  const pageState = parseJson(bytesByPath, REQUIRED_PATHS.pageState);
  const resourceTiming = parseJson(bytesByPath, REQUIRED_PATHS.resourceTiming);
  const applicationMap = parseJson(bytesByPath, REQUIRED_PATHS.applicationMap);
  const issues = parseJson(bytesByPath, REQUIRED_PATHS.issues);
  addCheck(
    checks,
    'runtime-page-state',
    pageState?.document && pageState?.geometry && pageState?.counts && pageState?.fonts
  );
  addCheck(
    checks,
    'runtime-resource-timing',
    Array.isArray(resourceTiming.entries) &&
      Number.isSafeInteger(resourceTiming.total) &&
      Number.isSafeInteger(resourceTiming.omitted)
  );
  addCheck(
    checks,
    'runtime-application-map',
    Array.isArray(applicationMap.customElements) &&
      Array.isArray(applicationMap.controls) &&
      Array.isArray(applicationMap.opaqueSurfaces)
  );
  addCheck(
    checks,
    'diagnostic-issues',
    Array.isArray(issues.issues) &&
      issues.issues.every(
        (issue) =>
          typeof issue?.stage === 'string' &&
          typeof issue?.severity === 'string' &&
          typeof issue?.code === 'string' &&
          typeof issue?.target === 'string' &&
          typeof issue?.explanation === 'string'
      )
  );
}

function verifySafety(checks, bytesByPath, manifestEntries) {
  const activeDiagnostics = manifestEntries.filter(
    (entry) =>
      entry.path.startsWith('diagnostics/') &&
      (entry.mimeType === 'text/html' || EXECUTABLE_DIAGNOSTIC_PATTERN.test(entry.path))
  );
  const sensitivePaths = [...bytesByPath]
    .filter(
      ([path]) =>
        path !== REQUIRED_PATHS.publishedDom &&
        (path.startsWith('diagnostics/') || path.startsWith('logs/'))
    )
    .filter(([path, bytes]) => {
      const rawContent = bytes.toString('utf8');
      const content = /\.html\.txt$/iu.test(path)
        ? Array.from(rawContent.matchAll(/(?:href|src|action|poster)="([^"]*)"/giu))
            .map((match) => match[1] ?? '')
            .join('\n')
        : rawContent;
      if (URL_CREDENTIAL_PATTERN.test(content)) return true;
      return [...content.matchAll(SENSITIVE_QUERY_PATTERN)].some((match) => {
        const value = (match[1] ?? '').toLowerCase();
        return value !== 'redacted' && value !== '***';
      });
    })
    .map(([path]) => path);
  addCheck(checks, 'inert-diagnostics', activeDiagnostics.length === 0);
  addCheck(
    checks,
    'sensitive-url-redaction',
    sensitivePaths.length === 0,
    sensitivePaths.length > 0 ? `Sensitive URL patterns found in: ${sensitivePaths.join(', ')}` : ''
  );
}

async function verifyManifest(checks, bytesByPath) {
  const manifest = parseJson(bytesByPath, REQUIRED_PATHS.manifest);
  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  const declaredPaths = new Set(entries.map((entry) => entry?.path));
  const actualPaths = new Set(bytesByPath.keys());
  const inventoryMatches =
    entries.every(isManifestEntry) &&
    actualPaths.size === declaredPaths.size + 1 &&
    actualPaths.has(REQUIRED_PATHS.manifest) &&
    [...declaredPaths].every((path) => actualPaths.has(path));
  let digestsMatch = inventoryMatches;
  if (inventoryMatches) {
    for (const entry of entries) {
      const bytes = bytesByPath.get(entry.path);
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (bytes.byteLength !== entry.size || digest !== entry.sha256) {
        digestsMatch = false;
        break;
      }
    }
  }
  addCheck(checks, 'manifest-inventory', inventoryMatches);
  addCheck(checks, 'manifest-digests', digestsMatch);
  return entries;
}

export async function verifySnapshotDiagnostics(archiveBytes) {
  const checks = [];
  try {
    const bytesByPath = await readArchive(archiveBytes);
    const manifestEntries = await verifyManifest(checks, bytesByPath);
    verifyIndex(checks, bytesByPath);
    verifyTimeline(checks, bytesByPath);
    verifyDomStates(checks, bytesByPath);
    verifyAssetLedger(checks, bytesByPath, manifestEntries);
    verifyStyleDiagnostics(checks, bytesByPath);
    verifyFrameDiagnostics(checks, bytesByPath);
    verifyRuntimeDiagnostics(checks, bytesByPath);
    verifySafety(checks, bytesByPath, manifestEntries);
  } catch (error) {
    addCheck(
      checks,
      'diagnostics-readable',
      false,
      error instanceof Error ? error.message : String(error)
    );
  }
  const violations = checks.filter((check) => check.status === 'failed').map((check) => check.id);
  return { checks, status: violations.length === 0 ? 'passed' : 'failed', violations };
}
