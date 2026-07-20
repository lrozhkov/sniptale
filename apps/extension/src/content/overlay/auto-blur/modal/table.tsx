import { useState } from 'react';
import { translate } from '../../../../platform/i18n';
import {
  AUTO_BLUR_CATEGORY_ORDER,
  type AutoBlurCategory,
} from '../../../../features/highlighter/contracts/auto-blur';
import { AutoBlurTableActions } from './table-actions';
import { renderCategoryRows } from './table-rows';
import type { AutoBlurTableProps } from './table-types';

export function AutoBlurTable(props: AutoBlurTableProps) {
  const [expandedCategories, setExpandedCategories] = useState(
    () => new Set<AutoBlurCategory>(AUTO_BLUR_CATEGORY_ORDER)
  );
  const isAnyExpanded = expandedCategories.size > 0;
  const isAnySelected = props.selectedCategories.size > 0 || props.selectedMatchIds.size > 0;

  const toggleExpanded = (category: AutoBlurCategory) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const toggleExpandAll = () =>
    setExpandedCategories(
      isAnyExpanded ? new Set() : new Set<AutoBlurCategory>(AUTO_BLUR_CATEGORY_ORDER)
    );

  return (
    <section className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="sniptale-label-sm">{translate('content.autoBlur.rowsTitle')}</div>
        <AutoBlurTableActions
          isAnyExpanded={isAnyExpanded}
          isAnySelected={isAnySelected}
          toggleExpandAll={toggleExpandAll}
          toggleSelectAll={props.toggleAllSelection}
        />
      </div>
      <AutoBlurTableHeader />
      <div role="treegrid" className="sniptale-modal-scroll max-h-[330px] overflow-auto">
        {AUTO_BLUR_CATEGORY_ORDER.flatMap((category) =>
          renderCategoryRows({ category, expandedCategories, props, toggleExpanded })
        )}
      </div>
    </section>
  );
}

function AutoBlurTableHeader() {
  return (
    <div
      className={[
        'grid grid-cols-[2.25rem_9rem_minmax(0,1fr)_10rem] px-2 text-xs',
        'text-[var(--sniptale-color-text-dim)]',
      ].join(' ')}
    >
      <div />
      <div>{translate('content.autoBlur.categoryColumn')}</div>
      <div>{translate('content.autoBlur.valueColumn')}</div>
      <div>{translate('content.autoBlur.statusColumn')}</div>
    </div>
  );
}
