import { translate } from '../../../../../platform/i18n';
import { PAGE_STYLE_ASSET_KINDS } from '@sniptale/runtime-contracts/page-style';
import { ColorField, Section } from '../fields';
import {
  LinkedSideFields,
  SIDE_ORDER,
  createBorderSideProperty,
  createRadiusProperty,
} from '../side-fields';
import { changedSummary, countModified, fieldState } from '../helpers';
import type { PageStyleInspectorActions, PageStyleInspectorViewState } from '../../types';
import { BackgroundFileField } from '../appearance/background-file-field';
import { GradientField } from '../appearance/gradient-field';
import { ShadowField } from '../appearance/shadow-field';

type SectionProps = {
  actions: PageStyleInspectorActions;
  disabled: boolean;
  state: PageStyleInspectorViewState;
};

const APPEARANCE_PROPERTIES = [
  'background-color',
  'background-image',
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
      title={translate('content.pageStyleInspector.sectionAppearance')}
      summary={changedSummary(modifiedCount)}
    >
      <SectionGroupLabel label={translate('content.pageStyleInspector.appearanceFillGroup')} />
      <ColorField
        disabled={disabled}
        label={translate('content.pageStyleInspector.backgroundColor')}
        {...fieldState(state, actions, 'background-color')}
        onChange={(value) => actions.updateValue('background-color', value)}
      />
      <BackgroundAppearanceFields actions={actions} disabled={disabled} state={state} />
      <BackgroundFileField
        asset={
          state.draftPatch.assets.find(
            (asset) => asset.kind === PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE
          ) ?? null
        }
        disabled={disabled}
        buttonLabel={translate('content.pageStyleInspector.chooseFile')}
        label={translate('content.pageStyleInspector.backgroundAsset')}
        onClear={actions.clearBackgroundAsset}
        onSelect={actions.saveBackgroundAsset}
      />
      <SectionGroupLabel label={translate('content.pageStyleInspector.appearanceBorderGroup')} />
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
      <GradientField
        disabled={disabled}
        label={translate('content.pageStyleInspector.backgroundImage')}
        {...fieldState(state, actions, 'background-image')}
        onChange={(value) => actions.updateValue('background-image', value)}
      />
      <ShadowField
        disabled={disabled}
        label={translate('content.pageStyleInspector.boxShadow')}
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
      labelKey: 'content.pageStyleInspector.borderWidth',
      properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'width')),
    },
    {
      key: 'style',
      labelKey: 'content.pageStyleInspector.borderStyle',
      properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'style')),
    },
    {
      key: 'color',
      labelKey: 'content.pageStyleInspector.borderColor',
      properties: SIDE_ORDER.map((side) => createBorderSideProperty(side, 'color')),
    },
    {
      key: 'radius',
      labelKey: 'content.pageStyleInspector.borderRadius',
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
