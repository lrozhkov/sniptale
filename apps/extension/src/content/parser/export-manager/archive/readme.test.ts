import { describe, expect, it } from 'vitest';
import type { ExportArchivePackageEntry } from './types';
import { createExportArchiveReadme } from './readme';

function createEntries(paths: string[]): ExportArchivePackageEntry[] {
  return paths.map((path) => ({ path, textContent: '' }));
}

describe('export archive README', () => {
  it('describes only present archive groups in English', () => {
    const readme = createExportArchiveReadme(
      createEntries([
        'browser-annotations.md',
        'example.json',
        'files/image.png',
        'page-screenshot.png',
      ]),
      { locale: 'en', pageUrl: 'https://user:secret@example.com/review?id=42#selection' }
    );

    expect(readme).toContain('# Sniptale export');
    expect(readme).toContain('### Design Review report');
    expect(readme).toContain('## Source page');
    expect(readme).toContain('`https://example.com/review`');
    expect(readme).not.toContain('user:secret');
    expect(readme).not.toContain('id=42');
    expect(readme).toContain('`browser-annotations.md`');
    expect(readme).toContain('`example.json`');
    expect(readme).toContain('`files/`');
    expect(readme).toContain('`page-screenshot.png`');
    expect(readme).not.toContain('### Diagnostics');
  });

  it('uses Russian copy and collapses diagnostic files into their documented folder', () => {
    const readme = createExportArchiveReadme(
      createEntries(['logs/errors.log', 'logs/css/computed-styles.json', 'extra.txt']),
      { locale: 'ru' }
    );

    expect(readme).toContain('# Экспорт Sniptale');
    expect(readme).toContain('### Диагностика');
    expect(readme).toContain('`logs/`');
    expect(readme).toContain('#### Как подготовлены диагностические данные');
    expect(readme).toContain('маской `***`');
    expect(readme).toContain('query и fragment');
    expect(readme).not.toContain('`logs/errors.log`');
    expect(readme).toContain('### Дополнительные файлы');
    expect(readme).toContain('`extra.txt`');
  });

  it('explains when the generated README is the only archive entry', () => {
    expect(createExportArchiveReadme([], { locale: 'en' })).toContain(
      'No additional files were included in the archive.'
    );
  });
});
