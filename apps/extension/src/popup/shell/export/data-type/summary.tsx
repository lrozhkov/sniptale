import type { ComponentType } from 'react';

import { translate } from '../../../../platform/i18n';
import {
  setExportOptionActive,
  type ExportOptionConfig,
  type ExportOptionToggleProps,
} from './options/data';
import { SelectionSummaryRow } from '../selection/summary-row';
import { cx } from '../selection/utils';

export type DataTypeSummaryItem = Pick<
  ExportOptionConfig,
  'accentClassName' | 'icon' | 'key' | 'label'
>;

function getSummaryListClassName(itemCount: number): string {
  return itemCount > 4
    ? 'grid grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto pl-1.5 pr-1'
    : 'space-y-1 overflow-y-auto pl-1.5 pr-1';
}

function DataTypeSummaryRow(props: {
  accentClassName: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onRemove: () => void;
}) {
  const Icon = props.icon;

  return (
    <SelectionSummaryRow
      icon={
        <Icon
          className={cx(
            'h-3.5 w-3.5 text-[var(--sniptale-color-text-secondary)]',
            props.accentClassName
          )}
        />
      }
      label={props.label}
      onRemove={props.onRemove}
    />
  );
}

export function renderDataTypeSummaryItems(
  items: DataTypeSummaryItem[],
  toggleProps: ExportOptionToggleProps
) {
  if (items.length === 0) {
    return (
      <div className="py-1 text-[11px] text-[var(--sniptale-color-text-dim)]">
        {translate('popup.export.noSelectedDataTypes')}
      </div>
    );
  }

  return (
    <div data-testid="export-data-type-summary" className={getSummaryListClassName(items.length)}>
      {items.map((item) => (
        <DataTypeSummaryRow
          key={item.key}
          accentClassName={item.accentClassName}
          icon={item.icon}
          label={item.label}
          onRemove={() => setExportOptionActive(item.key, false, toggleProps)}
        />
      ))}
    </div>
  );
}
