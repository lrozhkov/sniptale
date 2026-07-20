import { translate } from '../../../platform/i18n';
import type { TranslationKey } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { COLORS, diagnosticsPanelStyles as styles } from './styles';
import type { DiagnosticsPanelStats, EventFilter } from './types';

interface DiagnosticsPanelStatsBarProps {
  filter: EventFilter;
  stats: DiagnosticsPanelStats;
  setFilter: (filter: EventFilter) => void;
}

const FILTER_ITEMS: Array<{
  key: EventFilter;
  labelKey: TranslationKey;
  resolveColor: (stats: DiagnosticsPanelStats) => string;
  resolveValue: (stats: DiagnosticsPanelStats) => number;
}> = [
  {
    key: 'all',
    labelKey: 'videoEditor.diagnostics.filterAll',
    resolveColor: () => COLORS.primary,
    resolveValue: (stats) => stats.total,
  },
  {
    key: 'error',
    labelKey: 'videoEditor.diagnostics.filterErrors',
    resolveColor: () => COLORS.error,
    resolveValue: (stats) => stats.errors,
  },
  {
    key: 'warn',
    labelKey: 'videoEditor.diagnostics.filterWarnings',
    resolveColor: () => COLORS.warning,
    resolveValue: (stats) => stats.warns,
  },
  {
    key: 'network',
    labelKey: 'videoEditor.diagnostics.filterNetwork',
    resolveColor: () => COLORS.iconBlue,
    resolveValue: (stats) => stats.network,
  },
  {
    key: 'console',
    labelKey: 'videoEditor.diagnostics.filterConsole',
    resolveColor: () => COLORS.iconTeal,
    resolveValue: (stats) => stats.console,
  },
];

export function DiagnosticsPanelStatsBar({
  filter,
  stats,
  setFilter,
}: DiagnosticsPanelStatsBarProps) {
  return (
    <div style={styles['statsBar']}>
      {FILTER_ITEMS.map((item) => {
        const color = item.resolveColor(stats);
        const isActive = filter === item.key;

        return (
          <ProductActionButton
            active={isActive}
            aria-pressed={isActive}
            compact
            data-ui="video-editor.diagnostics.filter"
            key={item.key}
            onClick={() => setFilter(item.key)}
            tone="toggle"
            type="button"
            className="!h-auto !min-h-[64px] flex-col gap-0 rounded-none px-2 py-2"
          >
            <p style={{ ...styles['statValue'], color }}>{item.resolveValue(stats)}</p>
            <p style={styles['statLabel']}>{translate(item.labelKey)}</p>
          </ProductActionButton>
        );
      })}
    </div>
  );
}
