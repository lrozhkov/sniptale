import type { AppLocale } from '@sniptale/platform/i18n/config';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { getCurrentLocale, translate } from '../../../../platform/i18n';
import type { ExportArchivePackageEntry } from './types';

type ReadmeItem = { description: string; path: string };

function formatItem(item: ReadmeItem): string {
  return `- \`${item.path.replaceAll('`', '\\`')}\` — ${item.description}`;
}

function appendSection(lines: string[], title: string, items: ReadmeItem[]): void {
  if (items.length === 0) return;
  lines.push(`### ${title}`, '', ...items.map(formatItem), '');
}

function appendSourcePage(lines: string[], pageUrl: string | undefined, locale: AppLocale): void {
  const sanitizedPageUrl = sanitizeProvenanceUrl(pageUrl);
  if (!sanitizedPageUrl) return;

  lines.push(
    `## ${translate('content.exportReadme.sourcePageSection', locale)}`,
    '',
    `${translate('content.exportReadme.sourcePageAddress', locale)}: \`${sanitizedPageUrl.replaceAll('`', '\\`')}\``,
    '',
    translate('content.exportReadme.sourcePagePrivacyNote', locale),
    ''
  );
}

function appendDiagnosticsSanitization(lines: string[], locale: AppLocale): void {
  lines.push(
    `#### ${translate('content.exportReadme.diagnosticsSanitizationTitle', locale)}`,
    '',
    `- ${translate('content.exportReadme.diagnosticsCaptureNote', locale)}`,
    `- ${translate('content.exportReadme.diagnosticsRedactionNote', locale)}`,
    `- ${translate('content.exportReadme.diagnosticsUrlNote', locale)}`,
    ''
  );
}

function getRootPageDataItems(paths: string[], locale: AppLocale): ReadmeItem[] {
  return paths
    .filter(
      (path) =>
        !path.includes('/') &&
        path !== 'browser-annotations.md' &&
        (path.endsWith('.json') || path.endsWith('.md'))
    )
    .map((path) => ({
      description: translate(
        path.endsWith('.json')
          ? 'content.exportReadme.jsonDescription'
          : 'content.exportReadme.markdownDescription',
        locale
      ),
      path,
    }));
}

export function createExportArchiveReadme(
  entries: readonly ExportArchivePackageEntry[],
  options: { locale?: AppLocale; pageUrl?: string } = {}
): string {
  const locale = options.locale ?? getCurrentLocale();
  const paths = entries.map((entry) => entry.path);
  const documentedPaths = new Set<string>();
  const reportItems: ReadmeItem[] = [];
  const mediaItems: ReadmeItem[] = [];
  const diagnosticsItems: ReadmeItem[] = [];

  if (paths.includes('browser-annotations.md')) {
    documentedPaths.add('browser-annotations.md');
    reportItems.push({
      description: translate('content.exportReadme.annotationsDescription', locale),
      path: 'browser-annotations.md',
    });
  }

  const pageDataItems = getRootPageDataItems(paths, locale);
  pageDataItems.forEach((item) => documentedPaths.add(item.path));

  if (paths.includes('page-screenshot.png')) {
    documentedPaths.add('page-screenshot.png');
    mediaItems.push({
      description: translate('content.exportReadme.screenshotDescription', locale),
      path: 'page-screenshot.png',
    });
  }
  if (paths.includes('page-viewport-preview.png')) {
    documentedPaths.add('page-viewport-preview.png');
    mediaItems.push({
      description: translate('content.exportReadme.partialScreenshotDescription', locale),
      path: 'page-viewport-preview.png',
    });
  }
  if (paths.some((path) => path.startsWith('files/'))) {
    paths.filter((path) => path.startsWith('files/')).forEach((path) => documentedPaths.add(path));
    mediaItems.push({
      description: translate('content.exportReadme.filesDescription', locale),
      path: 'files/',
    });
  }
  if (paths.some((path) => path.startsWith('logs/'))) {
    paths.filter((path) => path.startsWith('logs/')).forEach((path) => documentedPaths.add(path));
    diagnosticsItems.push({
      description: translate('content.exportReadme.diagnosticsDescription', locale),
      path: 'logs/',
    });
  }

  const additionalItems = paths
    .filter((path) => !documentedPaths.has(path) && path.toLowerCase() !== 'readme.md')
    .map((path) => ({
      description: translate('content.exportReadme.additionalDescription', locale),
      path,
    }));
  const lines = [
    `# ${translate('content.exportReadme.title', locale)}`,
    '',
    translate('content.exportReadme.intro', locale),
    '',
  ];

  appendSourcePage(lines, options.pageUrl, locale);
  lines.push(`## ${translate('content.exportReadme.contents', locale)}`, '');

  appendSection(lines, translate('content.exportReadme.reportSection', locale), reportItems);
  appendSection(lines, translate('content.exportReadme.pageDataSection', locale), pageDataItems);
  appendSection(lines, translate('content.exportReadme.mediaSection', locale), mediaItems);
  appendSection(
    lines,
    translate('content.exportReadme.diagnosticsSection', locale),
    diagnosticsItems
  );
  if (diagnosticsItems.length > 0) {
    appendDiagnosticsSanitization(lines, locale);
  }
  appendSection(
    lines,
    translate('content.exportReadme.additionalSection', locale),
    additionalItems
  );
  if (entries.length === 0) {
    lines.push(translate('content.exportReadme.noAdditionalFiles', locale), '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}
