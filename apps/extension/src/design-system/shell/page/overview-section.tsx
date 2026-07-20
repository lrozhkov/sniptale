import { Layers3 } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { DESIGN_SYSTEM_REGISTRY } from '../../catalog/registry';
import { StatCard } from './primitives';

const OVERVIEW_PANEL_CLASS =
  'rounded-[16px] border border-[var(--sniptale-color-border-soft)] ' +
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_92%,transparent)] p-5';

export function DesignSystemOverviewSection(props: {
  filteredEntriesCount: number;
  filteredVariants: number;
  filteredUsageContexts: number;
  totalVariants: number;
  totalUsageContexts: number;
}) {
  return (
    <section id="overview" className="scroll-mt-36">
      <DesignSystemOverviewStats
        filteredEntriesCount={props.filteredEntriesCount}
        filteredVariants={props.filteredVariants}
        filteredUsageContexts={props.filteredUsageContexts}
        totalVariants={props.totalVariants}
        totalUsageContexts={props.totalUsageContexts}
      />
    </section>
  );
}

function DesignSystemOverviewStats(props: {
  filteredEntriesCount: number;
  filteredVariants: number;
  filteredUsageContexts: number;
  totalVariants: number;
  totalUsageContexts: number;
}) {
  return (
    <div className={OVERVIEW_PANEL_CLASS}>
      <div
        className={
          'flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] ' +
          'text-[var(--sniptale-color-text-muted-strong)]'
        }
      >
        <Layers3 className="h-3.5 w-3.5" />
        {translate('designSystem.page.catalogStatsTitle')}
      </div>
      <p className="mt-3 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]">
        {translate('designSystem.page.catalogStatsDescription')}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={translate('designSystem.page.componentFamiliesLabel')}
          value={`${props.filteredEntriesCount}/${DESIGN_SYSTEM_REGISTRY.length}`}
        />
        <StatCard
          label={translate('designSystem.page.variantCoverageLabel')}
          value={`${props.filteredVariants}/${props.totalVariants}`}
        />
        <StatCard
          label={translate('designSystem.page.usageCoverageLabel')}
          value={`${props.filteredUsageContexts}/${props.totalUsageContexts}`}
        />
      </div>
    </div>
  );
}
