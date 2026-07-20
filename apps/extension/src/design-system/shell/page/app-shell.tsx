import type { ReactNode } from 'react';
import type { AppLocale } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { AppTheme } from '../../../ui/theme';
import { DesignSystemCatalogExplorerSection } from './catalog-explorer';
import { DesignSystemTokenGroupsSection } from './catalog-sections';
import { DesignSystemFiltersSection } from './filter-sections';
import { DesignSystemNavigationRail } from './navigation-rail';
import { DesignSystemOverviewSection } from './overview-section';
import type { DesignSystemPageState } from './state';

const PAGE_ROOT_CLASS_NAME =
  'mx-auto flex w-full max-w-[1560px] flex-col gap-6 px-4 py-6 sm:px-6 xl:px-8';

const CONTENT_GRID_CLASS_NAME = 'grid gap-6 xl:grid-cols-[220px_minmax(0,1fr)]';

export function DesignSystemAppShell(props: {
  locale: AppLocale;
  previewMap: Map<string, ReactNode>;
  previewTheme: AppTheme;
  setPreviewTheme: (theme: AppTheme) => void;
  state: DesignSystemPageState;
}) {
  return (
    <main data-ui="design-system.page.root" className={PAGE_ROOT_CLASS_NAME}>
      <DesignSystemFiltersSection
        locale={props.locale}
        previewTheme={props.previewTheme}
        setPreviewTheme={props.setPreviewTheme}
        state={props.state}
      />

      <div className={CONTENT_GRID_CLASS_NAME}>
        <DesignSystemNavigationRail />
        <div className="min-w-0 space-y-6">
          <DesignSystemOverviewSection
            filteredEntriesCount={props.state.filteredEntriesCount}
            filteredVariants={props.state.filteredVariants}
            filteredUsageContexts={props.state.filteredUsageContexts}
            totalVariants={props.state.totalVariants}
            totalUsageContexts={props.state.totalUsageContexts}
          />
          <DesignSystemTokenGroupsSection />
          <DesignSystemCatalogSections
            locale={props.locale}
            previewMap={props.previewMap}
            state={props.state}
          />
        </div>
      </div>
    </main>
  );
}

function DesignSystemCatalogSections(props: {
  locale: AppLocale;
  previewMap: Map<string, ReactNode>;
  state: DesignSystemPageState;
}) {
  return (
    <>
      <DesignSystemCatalogExplorerSection
        sectionId="shared-catalog"
        title={translate('designSystem.page.sharedCatalogTitle')}
        description={translate('designSystem.page.sharedCatalogDescription')}
        entries={props.state.sharedEntries}
        expandedEntryId={props.state.expandedEntryId}
        locale={props.locale}
        onSelectEntry={props.state.setExpandedEntryId}
        previewMap={props.previewMap}
      />
      <DesignSystemCatalogExplorerSection
        sectionId="product-catalog"
        title={translate('designSystem.page.productCatalogTitle')}
        description={translate('designSystem.page.productCatalogDescription')}
        entries={props.state.productEntries}
        expandedEntryId={props.state.expandedEntryId}
        locale={props.locale}
        onSelectEntry={props.state.setExpandedEntryId}
        previewMap={props.previewMap}
      />
    </>
  );
}
