import { translate } from '../../../../../platform/i18n';
import { ColorField } from '../choice-fields';
import { Section } from '../section';
import {
  LinkedSideFields,
  SIDE_ORDER,
  createBorderSideProperty,
  createRadiusProperty,
} from '../side-fields';
import { changedSummary, countModified, fieldState } from '../helpers';
import type { DesignReviewActions, DesignReviewViewState } from '../../types';
import { ShadowField } from '../appearance/shadow-field';

type SectionProps = {
  actions: DesignReviewActions;
  disabled: boolean;
  state: DesignReviewViewState;
};

const APPEARANCE_PROPERTIES = [
  'background-color',
  'box-shadow',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-right-radius',
  'border-bottom-left-radius',
] as const;

export function AppearanceSection({ actions, disabled, state }: SectionProps) {
  const modifiedCount = countModified(state, APPEARANCE_PROPERTIES);

  return (
    <Section
      defaultCollapsed={modifiedCount === 0}
      title={translate('content.designReview.sectionAppearance')}
      summary={changedSummary(modifiedCount)}
    >
      <SectionGroupLabel label={translate('content.designReview.appearanceFillGroup')} />
      <ColorField
        disabled={disabled}
        label={translate('content.designReview.backgroundColor')}
        {...fieldState(state, actions, 'background-color')}
        onChange={(value) => actions.updateValue('background-color', value)}
      />
      <BackgroundAppearanceFields actions={actions} disabled={disabled} state={state} />
      <SectionGroupLabel label={translate('content.designReview.appearanceBorderGroup')} />
      <BorderSideFields actions={actions} disabled={disabled} state={state} />
    </Section>
  );
}

function SectionGroupLabel(props: { label: string }) {
  return (
    <div className="pt-1 text-[10px] font-bold uppercase text-[var(--sniptale-color-text-dim)]">
      {props.label}
    </div>
  );
}

function BackgroundAppearanceFields({ actions, disabled, state }: SectionProps) {
  return (
    <>
      <ShadowField
        disabled={disabled}
        label={translate('content.designReview.boxShadow')}
        {...fieldState(state, actions, 'box-shadow')}
        onChange={(value) => actions.updateValue('box-shadow', value)}
      />
    </>
  );
}

function BorderSideFields({ actions, disabled, state }: SectionProps) {
  const groups = [
    {
      key: 'width',
      labelKey: 'content.designReview.borderWidth',
      properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'width')),
    },
    {
      key: 'style',
      labelKey: 'content.designReview.borderStyle',
      properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'style')),
    },
    {
      key: 'color',
      labelKey: 'content.designReview.borderColor',
      properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'color')),
    },
    {
      key: 'radius',
      labelKey: 'content.designReview.borderRadius',
      properties: SIDE_ORDER.map(createRadiusProperty),
    },
  ] as const;

  return groups.map((group) => (
    <LinkedSideFields
      key={group.key}
      disabled={disabled}
      label={translate(group.labelKey)}
      properties={[...group.properties]}
      state={state}
      onChange={actions.updateValue}
      onChangeMany={actions.updateValues}
      onLinkedChange={actions.setSideFieldLinked}
    />
  ));
}
