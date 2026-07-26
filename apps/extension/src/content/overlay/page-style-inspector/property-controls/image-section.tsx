import { translate } from '../../../../platform/i18n';
import { SelectField } from './choice-fields';
import { FileField } from './file-field';
import { changedSummary, countModified, fieldState } from './helpers';
import { Section } from './section';
import { CssTextField } from './text-fields';
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

function ImageSelectionPreview(props: { state: PageStyleInspectorViewState }) {
  const element = props.state.selection?.element;
  if (!(element instanceof HTMLImageElement) || (!element.currentSrc && !element.src)) {
    return null;
  }

  return (
    <div
      className={[
        'relative aspect-[16/9] overflow-hidden rounded-[10px] border',
        'border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-input)]',
      ].join(' ')}
    >
      <img
        alt=""
        className="h-full w-full object-contain"
        draggable={false}
        src={element.currentSrc || element.src}
      />
    </div>
  );
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
    <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-x-3 gap-y-2">
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
