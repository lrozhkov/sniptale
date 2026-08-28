import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  PAGE_PACKAGE_SCHEMA_VERSION,
  type PagePackageDiagnosticsLevel,
  type PagePackageIntent,
  type PagePackageSource,
} from '@sniptale/runtime-contracts/page-package';
import { hashWebSnapshotAssetBlob } from '../../features/web-snapshot/asset-manifest';
import { createBlobContribution } from '../../workflows/page-package/contributions/blob';
import type { PagePackageContribution } from '../../workflows/page-package/paths';

type ReadmeInput = {
  contributions: readonly PagePackageContribution<Blob>[];
  diagnosticsLevel: PagePackageDiagnosticsLevel;
  intent: PagePackageIntent;
  source: PagePackageSource;
};

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
      'exports/images/ or page-screenshot.png'
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
  const webCopyNotes = entries.some((entry) => entry.component === 'webCopy')
    ? [
        '- The Web copy is a static, non-executable representation of the captured DOM.',
        '- Scripts and inline event handlers are removed. Navigation and form submission are disabled.',
        [
          '- Captured resource URLs are rewritten to local package paths.',
          'The Viewer blocks page-initiated network access.',
        ].join(' '),
        '- `page-screenshot.png` is visual evidence; `thumbnail.webp` is a compact preview.',
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
      : null,
    entries.some((entry) => ['pageData', 'attachments', 'diagnostics'].includes(entry.component))
      ? '5. Inspect the listed exported data, attachments, and inert diagnostics as needed.'
      : null,
  ].filter((line): line is string => line !== null);
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
  const contributions = input.contributions.filter(
    (entry) => entry.path !== PAGE_PACKAGE_ARCHIVE_PATHS.readme
  );
  const text = createPagePackageReadme({ ...input, contributions });
  const component = contributions[0]?.component ?? 'pageData';
  const readme = await createBlobContribution({
    blob: new Blob([text], { type: 'text/markdown' }),
    component,
    digest: hashWebSnapshotAssetBlob,
    mimeType: 'text/markdown',
    path: PAGE_PACKAGE_ARCHIVE_PATHS.readme,
  });
  return [readme, ...contributions];
}
