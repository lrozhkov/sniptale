import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  PAGE_PACKAGE_SCHEMA_VERSION,
  type PagePackageDiagnosticsLevel,
  type PagePackageIntent,
  type PagePackageSource,
} from '@sniptale/runtime-contracts/page-package';
import { hashWebSnapshotAssetBlob } from '../../features/web-snapshot/asset-manifest';
import { createBlobContribution } from './contributions/blob';
import type { PagePackageContribution } from './paths';
import { addPagePackageDiagnosticIndex } from './diagnostic-index';

type ReadmeInput = {
  contributions: readonly PagePackageContribution<Blob>[];
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  intent: PagePackageIntent;
  source: PagePackageSource;
};

const PARTIAL_SCREENSHOT_NOTE = [
  '- `page-viewport-preview.png` contains only the visible-area fallback',
  'and is not a full-page screenshot; `thumbnail.webp` is its compact preview.',
].join(' ');

const PARTIAL_SCREENSHOT_ANALYSIS_STEP = [
  '4. Treat `page-viewport-preview.png` only as partial visible-area evidence;',
  'use the static document for the captured page content.',
].join(' ');

function escapeCode(value: string): string {
  return value.replaceAll('`', '\\`');
}

function componentLine(
  contributions: readonly PagePackageContribution<Blob>[],
  component: PagePackageContribution<Blob>['component'],
  label: string,
  location: string
): string | null {
  const count = contributions.filter((entry) => entry.component === component).length;
  return count === 0 ? null : `- **${label}** (${count}): \`${location}\``;
}

function createPagePackageReadme(input: ReadmeInput): string {
  const entries = input.contributions.filter(
    (entry) => entry.path !== PAGE_PACKAGE_ARCHIVE_PATHS.readme
  );
  const contents = [
    componentLine(entries, 'webCopy', 'Safe Web copy', 'snapshot/ and assets/'),
    componentLine(entries, 'pageData', 'Extracted page data', 'exports/data/'),
    componentLine(
      entries,
      'images',
      'Images and captures',
      'exports/images/ or a declared root screenshot path'
    ),
    componentLine(entries, 'attachments', 'Downloaded attachments', 'attachments/'),
    componentLine(entries, 'diagnostics', 'Inert diagnostics', 'diagnostics/'),
  ].filter((line): line is string => line !== null);
  const sourceLines = [
    input.source.title
      ? `- Title: \`${escapeCode(input.source.title.replace(/[\r\n]+/g, ' '))}\``
      : null,
    input.source.url ? `- URL: \`${escapeCode(input.source.url)}\`` : null,
  ].filter((line): line is string => line !== null);
  const paths = new Set(entries.map((entry) => entry.path));
  const diagnosticStart = [
    '- Start with `diagnostics/index.json`; it maps the selected diagnostic sections',
    'and the live, prepared, and published representations.',
  ].join(' ');
  const exportLogLocation = [
    '- **Export log:** start with `diagnostics/export/logs/capture-timeline.json` and',
    '`diagnostics/export/logs/issues.json`; parser reports and extraction traces are beside them.',
  ].join(' ');
  const designLocation = [
    '- **Design and styles:** stylesheet inventory, targeted cascade/computed-style probes,',
    'pseudo-elements, and fonts are under `diagnostics/export/logs/css/`.',
  ].join(' ');
  const advancedLocation = [
    '- **Advanced page data:** the three DOM states, asset/frame/Shadow DOM evidence,',
    'safe runtime summary, resource timing, and application map are under',
    '`diagnostics/extended/` and `diagnostics/runtime/`.',
  ].join(' ');
  const diagnosticNavigation = entries.some((entry) => entry.component === 'diagnostics')
    ? [
        diagnosticStart,
        [...paths].some((path) => /\/(?:capture-timeline|issues)\.json$/u.test(path))
          ? exportLogLocation
          : null,
        [...paths].some(
          (path) => /\/css\//u.test(path) || /\/(?:fonts|stylesheets)\.json$/u.test(path)
        )
          ? designLocation
          : null,
        [...paths].some(
          (path) =>
            path.startsWith('diagnostics/extended/') || path.startsWith('diagnostics/runtime/')
        )
          ? advancedLocation
          : null,
      ].filter((line): line is string => line !== null)
    : ['- No diagnostic sections were selected.'];
  const webCopyNotes = entries.some((entry) => entry.component === 'webCopy')
    ? [
        '- The Web copy is a static, non-executable representation of the captured DOM.',
        '- Scripts and inline event handlers are removed. Navigation and form submission are disabled.',
        [
          '- Captured resource URLs are rewritten to local package paths.',
          'The Viewer blocks page-initiated network access.',
        ].join(' '),
        entries.some((entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot)
          ? PARTIAL_SCREENSHOT_NOTE
          : '- `page-screenshot.png` is full-page visual evidence; `thumbnail.webp` is a compact preview.',
      ]
    : ['- No safe Web copy was selected for this package.'];
  const diagnosticNotes =
    input.diagnosticsLevel === 'none'
      ? ['- Diagnostic data was not selected.']
      : [
          [
            `- Diagnostics level: \`${input.diagnosticsLevel}\`.`,
            'HTML-like evidence is inert text and must never be executed.',
          ].join(' '),
          [
            '- Credentials, form state, cookies, browser storage, request bodies,',
            'script bodies, and inline-handler bodies are excluded.',
          ].join(' '),
          [
            '- Sensitive values are sanitized or redacted, but visible text, ordinary attributes,',
            'and safe URL query values may remain.',
          ].join(' '),
        ];
  const analysisSteps = [
    '1. Validate `manifest.json` and every listed digest.',
    '2. Read this file and the manifest warnings.',
    entries.some((entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.snapshotHtml)
      ? '3. Use `snapshot/index.html` through the Sniptale Viewer for the safe visual representation.'
      : null,
    entries.some((entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot)
      ? '4. Compare `page-screenshot.png` with the Web copy when visual fidelity matters.'
      : entries.some((entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.partialScreenshot)
        ? PARTIAL_SCREENSHOT_ANALYSIS_STEP
        : null,
    entries.some((entry) => ['pageData', 'attachments', 'diagnostics'].includes(entry.component))
      ? '5. Inspect the listed exported data, attachments, and inert diagnostics as needed.'
      : null,
  ].filter((line): line is string => line !== null);
  const enforcedLimitsNote = [
    '- Resource and archive limits remain enforced. Omitted, blocked, truncated, or partially',
    'captured data is reported in the manifest, `diagnostics/*/logs/issues.json`,',
    'the asset ledger, or redaction reports when those sections are selected.',
  ].join(' ');
  const runtimeTimingNote = [
    '- Runtime timing contains metadata only: no request or response headers, cookies,',
    'request bodies, response bodies, or storage values.',
  ].join(' ');
  const formStateNote = [
    '- Form controls are inventoried without user-entered values. Script metadata may contain',
    'sanitized URLs and hashes, but script bodies are not retained.',
  ].join(' ');
  const browserBoundaryNote = [
    '- Accessible open Shadow DOM and same-origin frames may be described;',
    'closed Shadow DOM and cross-origin frame contents cannot be captured by this browser context.',
  ].join(' ');
  const diagnosticBoundaryNote = [
    '- This is a diagnostic snapshot of page state and the save process, not an execution trace.',
    'It cannot explain framework state transitions, event-handler execution,',
    'JavaScript heap state, or API response bodies.',
  ].join(' ');
  return [
    '# Sniptale Page Package',
    '',
    [
      `This archive is a Page Package v${PAGE_PACKAGE_SCHEMA_VERSION}`,
      `produced by an explicit \`${input.intent}\` action.`,
    ].join(' '),
    [
      '`manifest.json` is the canonical inventory. Use its paths, MIME types, sizes,',
      'SHA-256 digests, component status, and warnings to verify the archive.',
    ].join(' '),
    '',
    ...(sourceLines.length > 0 ? ['## Source', '', ...sourceLines, ''] : []),
    '## Actual contents',
    '',
    ...(contents.length > 0 ? contents : ['- No optional content components were retained.']),
    '',
    '## Capture and safety model',
    '',
    ...webCopyNotes,
    ...diagnosticNotes,
    '- Extracted JSON/Markdown is parser-derived data, not a byte-for-byte copy of the live page.',
    '- Missing or blocked resources are recorded in `manifest.json` warnings and component status.',
    enforcedLimitsNote,
    runtimeTimingNote,
    formStateNote,
    browserBoundaryNote,
    '',
    '## Applied limitations',
    '',
    '- Executable page code, inline handlers, forms, and page-initiated network access were disabled.',
    '- Resource collection was bounded by the selected capture policy and application safety ceilings.',
    '- Diagnostic strings, collections, and timing entries were sanitized and bounded before export.',
    '- `manifest.json` warnings, the asset ledger, redaction reports, and `issues.json` identify known omissions.',
    '',
    '## Diagnostic map',
    '',
    ...diagnosticNavigation,
    diagnosticBoundaryNote,
    '',
    '## Suggested analysis order',
    '',
    ...analysisSteps,
    '',
  ].join('\n');
}

export async function addPagePackageReadme(
  input: ReadmeInput
): Promise<PagePackageContribution<Blob>[]> {
  const withoutReadme = input.contributions.filter(
    (entry) => entry.path !== PAGE_PACKAGE_ARCHIVE_PATHS.readme
  );
  const component = withoutReadme[0]?.component ?? 'pageData';
  const contributions = await addPagePackageDiagnosticIndex({
    ...input,
    contributions: withoutReadme,
  });
  const text = createPagePackageReadme({ ...input, contributions });
  const readme = await createBlobContribution({
    blob: new Blob([text], { type: 'text/markdown' }),
    component,
    digest: hashWebSnapshotAssetBlob,
    mimeType: 'text/markdown',
    path: PAGE_PACKAGE_ARCHIVE_PATHS.readme,
  });
  return [readme, ...contributions];
}
