import { CheckboxField } from '../../../../ui/compact-inspector-controls';
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
    <CheckboxField
      label={label}
      value={props.selected}
      onChange={() => props.toggleCategory(props.category)}
    />
  );
}

export function AutoBlurAutoApplyCategories(props: {
  selectedCategories: Set<AutoBlurCategory>;
  toggleCategory: (category: AutoBlurCategory) => void;
}) {
  return (
    <section className="grid gap-2" data-ui="content.auto-blur.auto-apply-categories">
      <div className="grid gap-1">
        <div className="text-[13px] leading-[18px] font-medium text-[var(--sniptale-color-text-secondary)]">
          {translate('content.autoBlur.autoApplyCategoriesTitle')}
        </div>
        <div className="text-xs leading-4 text-[var(--sniptale-color-text-secondary)]">
          {translate('content.autoBlur.autoApplyCategoriesDescription')}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1">
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
