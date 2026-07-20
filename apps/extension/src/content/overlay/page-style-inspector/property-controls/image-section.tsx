import { translate } from '../../../../platform/i18n';
import { CssTextField, Section, SelectField } from './fields';
import { FileField } from './file-field';
import { changedSummary, countModified, fieldState } from './helpers';
import { ImageSelectionPreview } from './image-preview';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../types';

type ImageSectionProps = {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
};

function getObjectFitOptions() {
  return [
    { value: 'fill', label: translate('content.pageStyleInspector.optionFill') },
    { value: 'contain', label: translate('content.pageStyleInspector.optionContain') },
    { value: 'cover', label: translate('content.pageStyleInspector.optionCover') },
    { value: 'none', label: translate('content.pageStyleInspector.optionNone') },
    { value: 'scale-down', label: translate('content.pageStyleInspector.optionScaleDown') },
  ];
}

export function ImageSection({ actions, disabled, state }: ImageSectionProps) {
  if (state.selection?.kind !== 'image') {
    return null;
  }

  return (
    <Section
      title={translate('content.pageStyleInspector.sectionImage')}
      summary={changedSummary(countModified(state, ['object-fit', 'object-position']))}
    >
      <ImageSelectionPreview state={state} />
      <FileField
        disabled={disabled}
        buttonLabel={translate('content.pageStyleInspector.replaceFile')}
        label={translate('content.pageStyleInspector.replaceImage')}
        onSelect={actions.saveImageReplacement}
      />
      <ImageFitFields actions={actions} disabled={disabled} state={state} />
    </Section>
  );
}

function ImageFitFields({ actions, disabled, state }: ImageSectionProps) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
      <SelectField
        disabled={disabled}
        label={translate('content.pageStyleInspector.objectFit')}
        {...fieldState(state, actions, 'object-fit')}
        options={getObjectFitOptions()}
        onChange={(value) => actions.updateValue('object-fit', value)}
      />
      <CssTextField
        disabled={disabled}
        emptyValues={['normal']}
        label={translate('content.pageStyleInspector.objectPosition')}
        placeholder={translate('content.pageStyleInspector.objectPositionPlaceholder')}
        {...fieldState(state, actions, 'object-position')}
        onChange={(value) => actions.updateValue('object-position', value)}
      />
    </div>
  );
}
