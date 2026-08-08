import { AUTO_BLUR_CATEGORY_ORDER } from '../../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurCategory } from '../../../../features/highlighter/contracts/auto-blur';
import { translate } from '../../../../platform/i18n';
import { getAutoBlurCategoryLabel } from './category-labels';

function AutoBlurCategoryOption(props: {
  category: AutoBlurCategory;
  selected: boolean;
  toggleCategory: (category: AutoBlurCategory) => void;
}) {
  const label = getAutoBlurCategoryLabel(props.category);
  return (
    <label
      className={[
        'flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[10px] border px-3 py-2',
        'transition-[border-color,background-color]',
        props.selected
          ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-surface-input)]'
          : 'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
    >
      <input
        aria-label={label}
        checked={props.selected}
        className="sniptale-checkbox"
        onChange={() => props.toggleCategory(props.category)}
        type="checkbox"
      />
      <span className="text-sm font-medium text-[var(--sniptale-color-text-primary)]">{label}</span>
    </label>
  );
}

export function AutoBlurAutoApplyCategories(props: {
  selectedCategories: Set<AutoBlurCategory>;
  toggleCategory: (category: AutoBlurCategory) => void;
}) {
  return (
    <section className="grid gap-3" data-ui="content.auto-blur.auto-apply-categories">
      <div className="grid gap-1">
        <div className="text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
          {translate('content.autoBlur.autoApplyCategoriesTitle')}
        </div>
        <div className="text-xs leading-5 text-[var(--sniptale-color-text-secondary)]">
          {translate('content.autoBlur.autoApplyCategoriesDescription')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {AUTO_BLUR_CATEGORY_ORDER.map((category) => (
          <AutoBlurCategoryOption
            category={category}
            key={category}
            selected={props.selectedCategories.has(category)}
            toggleCategory={props.toggleCategory}
          />
        ))}
      </div>
    </section>
  );
}
