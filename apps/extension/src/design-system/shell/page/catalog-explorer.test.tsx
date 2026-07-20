// @vitest-environment jsdom

import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DesignSystemRegistryEntry } from '../../catalog/registry/types';
import { DesignSystemCatalogExplorerSection } from './catalog-explorer';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('../../catalog/localization', () => ({
  localize: (_locale: string, ru: string, en: string) => `${en}/${ru}`,
}));

vi.mock('../../catalog/card', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../catalog/card')>()),
  DesignSystemCatalogEntryDetails: (props: { entry: { componentId: string } }) => (
    <div data-testid={`details-${props.entry.componentId}`}>{props.entry.componentId}</div>
  ),
  getDesignSystemScopeLabel: (_locale: string, scope: string) => scope,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const entries: DesignSystemRegistryEntry[] = [
  {
    componentId: 'entry-a',
    descriptionEn: 'Entry A description',
    descriptionRu: 'Entry A description',
    kind: 'surface',
    labelEn: 'Entry A',
    labelRu: 'Entry A',
    scope: 'shared-ui',
    source: 'src/a.tsx',
    sourceFiles: ['src/a.tsx'],
    status: 'active',
    usageContexts: [
      {
        files: ['src/a.tsx'],
        labelEn: 'Usage A',
        labelRu: 'Usage A',
        status: 'active',
        usageId: 'usage-a',
      },
    ],
    variants: [
      {
        descriptionEn: 'Default variant',
        descriptionRu: 'Default variant',
        labelEn: 'Default',
        labelRu: 'Default',
        technicalNotesEn: [],
        technicalNotesRu: [],
        variantId: 'default',
      },
    ],
  },
  {
    componentId: 'entry-b',
    descriptionEn: 'Entry B description',
    descriptionRu: 'Entry B description',
    kind: 'feedback',
    labelEn: 'Entry B',
    labelRu: 'Entry B',
    scope: 'product-ui',
    source: 'src/b.tsx',
    sourceFiles: ['src/b.tsx'],
    status: 'active',
    usageContexts: [
      {
        files: ['src/b.tsx'],
        labelEn: 'Usage B',
        labelRu: 'Usage B',
        status: 'active',
        usageId: 'usage-b',
      },
      {
        files: ['src/c.tsx'],
        labelEn: 'Usage C',
        labelRu: 'Usage C',
        status: 'planned',
        usageId: 'usage-c',
      },
    ],
    variants: [
      {
        descriptionEn: 'Default variant',
        descriptionRu: 'Default variant',
        labelEn: 'Default',
        labelRu: 'Default',
        technicalNotesEn: [],
        technicalNotesRu: [],
        variantId: 'default',
      },
      {
        descriptionEn: 'Compact variant',
        descriptionRu: 'Compact variant',
        labelEn: 'Compact',
        labelRu: 'Compact',
        technicalNotesEn: [],
        technicalNotesRu: [],
        variantId: 'compact',
      },
    ],
  },
];

function Harness() {
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>('entry-a');

  return (
    <DesignSystemCatalogExplorerSection
      sectionId="shared-catalog"
      title="Shared UI"
      description="Section description"
      entries={entries}
      expandedEntryId={expandedEntryId}
      locale="en"
      onSelectEntry={setExpandedEntryId}
      previewMap={new Map()}
    />
  );
}

describe('DesignSystemCatalogExplorerSection', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    container = null;
  });

  it('keeps a single expanded entry and switches details when a different summary row is selected', async () => {
    await act(async () => {
      root?.render(<Harness />);
    });

    expect(container?.querySelector('[data-testid="details-entry-a"]')).not.toBeNull();
    expect(container?.querySelector('[data-testid="details-entry-b"]')).toBeNull();

    const buttons = container?.querySelectorAll('button');
    const secondEntryButton = buttons?.[1] as HTMLButtonElement;

    await act(async () => {
      secondEntryButton.click();
    });

    expect(container?.querySelector('[data-testid="details-entry-a"]')).toBeNull();
    expect(container?.querySelector('[data-testid="details-entry-b"]')).not.toBeNull();
  });
});
