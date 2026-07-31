import { translate } from '../../../../platform/i18n';
import { SelectField } from './choice-fields';
import { fieldState } from './helpers';
import { CssTextField } from './text-fields';
import type { DesignReviewActions, DesignReviewViewState } from '../types';

type ImageSectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
};

function getObjectFitOptions() {
  return [
    { value: 'fill', label: translate('content.designReview.optionFill') },
    { value: 'contain', label: translate('content.designReview.optionContain') },
    { value: 'cover', label: translate('content.designReview.optionCover') },
    { value: 'none', label: translate('content.designReview.optionNone') },
    { value: 'scale-down', label: translate('content.designReview.optionScaleDown') },
  ];
}

export function ImageSection({ actions, disabled, state }: ImageSectionProps) {
  if (state.selection?.kind !== 'image') {
    return null;
  }

  return (
    <div className="grid gap-2" data-ui="content.design-review.settings-image">
      <ImageFitFields actions={actions} disabled={disabled} state={state} />
    </div>
  );
}

function ImageFitFields({ actions, disabled, state }: ImageSectionProps) {
  return (
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-2">
      <SelectField
        disabled={disabled}
        label={translate('content.designReview.objectFit')}
        {...fieldState(state, actions, 'object-fit')}
        options={getObjectFitOptions()}
        onChange={(value) => actions.updateValue('object-fit', value)}
      />
      <CssTextField
        disabled={disabled}
        emptyValues={['normal']}
        label={translate('content.designReview.objectPosition')}
        placeholder={translate('content.designReview.objectPositionPlaceholder')}
        {...fieldState(state, actions, 'object-position')}
        onChange={(value) => actions.updateValue('object-position', value)}
      />
    </div>
  );
}
