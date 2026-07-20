import { translate } from '../../../../../platform/i18n';
import { ColorField, Section } from '../fields';
import { NumericField } from '../numeric-field';
import { changedSummary, countModified, fieldState } from '../helpers';
import { TextAlignButtons, TextModeButtons } from '../text/buttons';
import {
  getFontFamilyOptions,
  getLetterSpacingOptions,
  getLineHeightOptions,
} from '../text/options';
import { TextSelectField } from '../text/select-field';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../../types';

type SectionProps = {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
};

const TEXT_PROPERTIES = [
  'color',
  'font-style',
  'font-family',
  'font-weight',
  'text-decoration',
  'font-size',
  'line-height',
  'letter-spacing',
  'text-align',
] as const;

export function TextSection({ actions, disabled, state }: SectionProps) {
  const change = actions.updateValue;

  return (
    <Section
      title={translate('content.pageStyleInspector.sectionText')}
      summary={changedSummary(countModified(state, TEXT_PROPERTIES))}
    >
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <TextModeButtons actions={actions} disabled={disabled} state={state} />
        <TextAlignButtons actions={actions} disabled={disabled} state={state} />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div className="col-span-2">
          <ColorField
            disabled={disabled}
            label={translate('content.pageStyleInspector.color')}
            {...fieldState(state, actions, 'color')}
            onChange={(value) => change('color', value)}
          />
        </div>
        <TextSelectField
          disabled={disabled}
          label={translate('content.pageStyleInspector.fontFamily')}
          options={getFontFamilyOptions(fieldState(state, actions, 'font-family').value)}
          {...fieldState(state, actions, 'font-family')}
          onChange={(value) => change('font-family', value)}
        />
        <TextNumericFields actions={actions} disabled={disabled} state={state} />
      </div>
    </Section>
  );
}

function TextNumericFields({ actions, disabled, state }: SectionProps) {
  const change = actions.updateValue;

  return (
    <>
      <NumericField
        disabled={disabled}
        label={translate('content.pageStyleInspector.fontSize')}
        {...fieldState(state, actions, 'font-size')}
        onChange={(value) => change('font-size', value)}
      />
      <TextSelectField
        disabled={disabled}
        label={translate('content.pageStyleInspector.lineHeight')}
        options={getLineHeightOptions(fieldState(state, actions, 'line-height').value)}
        {...fieldState(state, actions, 'line-height')}
        onChange={(value) => change('line-height', value)}
      />
      <TextSelectField
        disabled={disabled}
        label={translate('content.pageStyleInspector.letterSpacing')}
        options={getLetterSpacingOptions(fieldState(state, actions, 'letter-spacing').value)}
        {...fieldState(state, actions, 'letter-spacing')}
        onChange={(value) => change('letter-spacing', value)}
      />
    </>
  );
}
