// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DesignSystemCatalogCard,
  DesignSystemCatalogEntryDetails,
  getDesignSystemScopeLabel,
} from '.';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./sections', () => ({
  DesignSystemCatalogHeader: (props: { scopeLabel: string }) => (
    <div data-testid="catalog-header">{props.scopeLabel}</div>
  ),
  DesignSystemCatalogSummarySection: () => <div data-testid="catalog-summary" />,
  DesignSystemCatalogSourceFilesSection: () => <div data-testid="catalog-source-files" />,
  DesignSystemCatalogUsageSection: () => <div data-testid="catalog-usage" />,
  DesignSystemCatalogVariantsSection: () => <div data-testid="catalog-variants" />,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const entry = {
  componentId: 'shared.ui.content-size-tooltip',
  descriptionEn: 'Tooltip description',
  descriptionRu: 'Tooltip description',
  kind: 'surface',
  labelEn: 'Content size tooltip',
  labelRu: 'Content size tooltip',
  scope: 'shared-ui',
  source: '@sniptale/ui/content-size-tooltip',
  sourceFiles: ['@sniptale/ui/content-size-tooltip'],
  status: 'active',
  usageContexts: [],
  variants: [],
} as never;

describe('design-system catalog card', () => {
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

  it('resolves scope labels for both shared and product registry entries', () => {
    expect(getDesignSystemScopeLabel('en', 'shared-ui')).toBe('designSystem.page.scopeSharedLabel');
    expect(getDesignSystemScopeLabel('en', 'product-ui')).toBe(
      'designSystem.page.scopeProductLabel'
    );
  });

  it('renders the catalog header and details grid for the expanded entry content', async () => {
    await act(async () => {
      root?.render(
        <div>
          <DesignSystemCatalogCard entry={entry} locale="en" previewMap={new Map()} />
          <DesignSystemCatalogEntryDetails entry={entry} locale="en" previewMap={new Map()} />
        </div>
      );
    });

    expect(container?.querySelectorAll('[data-testid="catalog-header"]')).toHaveLength(1);
    expect(container?.querySelectorAll('[data-testid="catalog-summary"]')).toHaveLength(2);
    expect(container?.querySelectorAll('[data-testid="catalog-source-files"]')).toHaveLength(2);
    expect(container?.querySelectorAll('[data-testid="catalog-usage"]')).toHaveLength(2);
    expect(container?.querySelectorAll('[data-testid="catalog-variants"]')).toHaveLength(2);
  });
});
