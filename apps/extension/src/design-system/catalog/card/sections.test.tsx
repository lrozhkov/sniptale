import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string, locale?: string) => `${key}:${locale ?? 'default'}`,
}));

import type { DesignSystemRegistryEntry } from '../registry/types';
import {
  DesignSystemCatalogHeader,
  DesignSystemCatalogSourceFilesSection,
  DesignSystemCatalogSummarySection,
  DesignSystemCatalogUsageSection,
} from './sections';

function createEntry(
  overrides: Partial<DesignSystemRegistryEntry> = {}
): DesignSystemRegistryEntry {
  return {
    componentId: 'shared.ui.command-palette',
    descriptionEn: 'Command palette summary',
    descriptionRu: 'Описание',
    kind: 'feedback',
    labelEn: 'Command palette',
    labelRu: 'Палитра команд',
    scope: 'shared-ui',
    source: 'apps/extension/src/ui/command-palette/index.tsx',
    sourceFiles: [
      '../../../ui/command-palette/index.tsx',
      '../../previews/command-palette/design-system.tsx',
    ],
    status: 'active',
    usageContexts: [
      {
        files: ['apps/extension/src/editor/index.tsx'],
        labelEn: 'Editor entrypoint',
        labelRu: 'Редактор',
        status: 'active',
        usageId: 'editor.entry',
      },
      {
        files: ['apps/extension/src/video-editor/index.tsx'],
        labelEn: 'Video editor entrypoint',
        labelRu: 'Видео',
        status: 'planned',
        usageId: 'video.entry',
      },
    ],
    variants: [],
    ...overrides,
  };
}

describe('design system catalog sections', () => {
  it('renders localized header and summary metadata for active and planned entries', () => {
    const activeMarkup = renderToStaticMarkup(
      <DesignSystemCatalogHeader entry={createEntry()} locale="en" scopeLabel="Shared UI" />
    );
    const plannedMarkup = renderToStaticMarkup(
      <DesignSystemCatalogHeader
        entry={createEntry({ status: 'planned' })}
        locale="ru"
        scopeLabel="Product UI"
      />
    );
    const summaryMarkup = renderToStaticMarkup(
      <DesignSystemCatalogSummarySection entry={createEntry()} locale="en" />
    );

    expect(activeMarkup).toContain('designSystem.page.statusActive:en');
    expect(activeMarkup).toContain('Command palette');
    expect(plannedMarkup).toContain('designSystem.page.statusPlanned:ru');
    expect(summaryMarkup).toContain('designSystem.page.componentSummaryTitle:en');
    expect(summaryMarkup).toContain('Command palette summary');
    expect(summaryMarkup).toContain('apps/extension/src/ui/command-palette/index.tsx');
  });

  it('renders source file pills and usage cards for both usage statuses', () => {
    const entry = createEntry();
    const sourceMarkup = renderToStaticMarkup(
      <DesignSystemCatalogSourceFilesSection entry={entry} locale="en" />
    );
    const usageMarkup = renderToStaticMarkup(
      <DesignSystemCatalogUsageSection entry={entry} locale="ru" />
    );

    expect(sourceMarkup).toContain('designSystem.page.sourceFilesTitle:en');
    expect(sourceMarkup).toContain('../../previews/command-palette/design-system.tsx');
    expect(usageMarkup).toContain('editor.entry');
    expect(usageMarkup).toContain('video.entry');
    expect(usageMarkup).toContain('designSystem.page.statusActive:ru');
    expect(usageMarkup).toContain('designSystem.page.statusPlanned:ru');
  });
});
